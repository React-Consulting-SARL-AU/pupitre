package modules

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"pupitre.studio/agent/internal/i18n"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/license"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/lock"
)

const (
	DefaultReportPath  = "/var/lib/pupitre/report.json"
	DefaultLogPath     = "/var/log/pupitre.log"
	DefaultInstallPath = "/etc/pupitre/install.json"
	DefaultLockPath    = "/var/lib/pupitre/install.lock"
)

type Engine struct {
	Registry     *Registry
	Sys          sys.Sys
	Now          func() time.Time
	License      func() contract.License
	AgentVersion string
	ReportPath   string
	LogPath      string
	InstallPath  string
	// Held across processes: a serve left behind by a dropped channel may still be installing.
	LockPath string
	// Empty means no lock, which the tests rely on.
	ProjectsLockPath string

	mu sync.Mutex
}

type Request struct {
	Modules []string                  `json:"modules"`
	Config  map[string]map[string]any `json:"config"`
	// Installed without validation or Configure until a later request names them without deferring.
	Defer   []string                     `json:"defer,omitempty"`
	Secrets map[string]map[string]string `json:"secrets,omitempty"`
	Persist bool                         `json:"-"`
}

func (r Request) Deferred(id string) bool {
	return slices.Contains(r.Defer, id)
}

// Unnamed modules keep their config and deferral, and unsent secrets stay: a reconfigure must not clear a password.
func (r Request) completedBy(kept Request) Request {
	config := map[string]map[string]any{}
	for id, values := range kept.Config {
		config[id] = values
	}

	for id, values := range r.Config {
		config[id] = values
	}

	later := append([]string(nil), r.Defer...)
	for _, id := range kept.Defer {
		if !slices.Contains(r.Modules, id) && !slices.Contains(later, id) {
			later = append(later, id)
		}
	}

	r.Config = config
	r.Defer = later
	r.Secrets = mergeSecrets(kept.Secrets, r.Secrets)

	return r
}

type Sink func(contract.StepEvent)

func (e *Engine) Catalog() contract.Catalog {
	return contract.Catalog{Modules: e.Registry.Manifests(), Presets: contract.Presets}
}

func (e *Engine) Install(request Request, sink Sink) (contract.InstallResult, error) {
	unlock, err := e.acquire()
	if err != nil {
		return contract.InstallResult{}, err
	}
	defer unlock()

	modules, err := e.Registry.Resolve(request.Modules)
	if err != nil {
		return contract.InstallResult{}, err
	}

	r := e.newRun(request, sink)
	defer r.close()

	kept := e.recall(r)
	if err := e.refuseInstalledConflicts(r, modules, kept); err != nil {
		return contract.InstallResult{}, err
	}

	request = request.completedBy(kept)
	r.redactAll(request.Secrets)

	if err := refuseDeferringMandatory(modules, request); err != nil {
		return contract.InstallResult{}, err
	}

	// Validated before the first step so a missing field never leaves the machine half-installed.
	if problems := fieldProblems(modules, request); len(problems) > 0 {
		return contract.InstallResult{}, invalidConfig(problems)
	}

	if request.Persist {
		if err := e.remember(r, request, ids(modules)); err != nil {
			return contract.InstallResult{}, err
		}
	}

	report := e.start(r, "install", modules)

	for _, module := range modules {
		ctx := r.context(module.Manifest(), request.Config[module.Manifest().ID], request.Secrets[module.Manifest().ID])
		ctx.held = kept.Config[module.Manifest().ID]
		r.following(ctx)

		execute(ctx, "install", func() error { return module.Install(ctx) })

		if !(ctx.failed || request.Deferred(module.Manifest().ID)) {
			execute(ctx, "configure", func() error { return module.Configure(ctx) })
		}

		report.Modules = append(report.Modules, ctx.report())
		if ctx.failed {
			report.Failed = append(report.Failed, ctx.manifest.ID)
		}
		r.settled(report)
	}

	return e.finish(r, report)
}

func (e *Engine) Upgrade(request Request, sink Sink) (contract.InstallResult, error) {
	unlock, err := e.acquire()
	if err != nil {
		return contract.InstallResult{}, err
	}
	defer unlock()

	ids := request.Modules
	if len(ids) == 0 {
		for _, manifest := range e.Registry.Manifests() {
			ids = append(ids, manifest.ID)
		}
	}

	candidates, err := e.Registry.Lookup(ids)
	if err != nil {
		return contract.InstallResult{}, err
	}

	r := e.newRun(request, sink)
	defer r.close()

	recalled := e.recall(r)
	if request.Config == nil {
		request.Config = recalled.Config
	}
	if request.Secrets == nil {
		request.Secrets = recalled.Secrets
		r.redactAll(request.Secrets)
	}

	// A deferred module's Configure would run on no answer at all, so it waits for one.
	modules := withoutDeferred(e.installedAmong(r, candidates, recalled), recalled.Defer)
	report := e.start(r, "upgrade", modules)

	for _, module := range modules {
		ctx := r.context(module.Manifest(), request.Config[module.Manifest().ID], request.Secrets[module.Manifest().ID])
		ctx.held = recalled.Config[module.Manifest().ID]
		r.following(ctx)

		execute(ctx, "upgrade", func() error { return module.Upgrade(ctx) })

		report.Modules = append(report.Modules, ctx.report())
		if ctx.failed {
			report.Failed = append(report.Failed, ctx.manifest.ID)
		}
		r.settled(report)
	}

	return e.finish(r, report)
}

func (e *Engine) Uninstall(ids []string, sink Sink) (contract.UninstallResult, error) {
	unlock, err := e.acquire()
	if err != nil {
		return contract.UninstallResult{}, err
	}
	defer unlock()

	requested, err := e.Registry.Lookup(ids)
	if err != nil {
		return contract.UninstallResult{}, err
	}

	modules, err := order(asMap(requested))
	if err != nil {
		return contract.UninstallResult{}, err
	}

	r := e.newRun(Request{}, sink)
	defer r.close()

	recalled := e.recall(r)
	r.redactAll(recalled.Secrets)

	if err := e.refuseForeign(r, modules, recalled); err != nil {
		return contract.UninstallResult{}, err
	}

	if err := e.refuseStillRequired(r, modules, recalled); err != nil {
		return contract.UninstallResult{}, err
	}

	result := contract.UninstallResult{Failed: []string{}}
	var removed []string

	r.journal.logf("pupitred", "uninstall : %s", idsOf(modules))

	for i := len(modules) - 1; i >= 0; i-- {
		module := modules[i]
		ctx := r.recalled(module.Manifest(), recalled)

		execute(ctx, "uninstall", func() error { return module.Uninstall(ctx) })

		if ctx.failed {
			result.Failed = append(result.Failed, ctx.manifest.ID)
		}
		if !ctx.failed {
			removed = append(removed, module.Manifest().ID)
		}
	}

	if err := e.forget(r, removed); err != nil {
		return contract.UninstallResult{}, err
	}

	return result, nil
}

func (e *Engine) Command(id string, sink Sink, fn func(ctx *Context) error) error {
	unlock, err := e.acquire()
	if err != nil {
		return err
	}
	defer unlock()

	module, ok := e.Registry.Get(id)
	if !ok {
		return moduleNotFound(id)
	}

	r := e.newRun(Request{}, sink)
	defer r.close()

	recalled := e.recall(r)
	r.redactAll(recalled.Secrets)
	r.registry = e.Registry
	r.remembered = recalled

	return fn(r.recalled(module.Manifest(), recalled))
}

// No lock nor license: a status asked mid-install must answer, not report absent an exposure the machine holds.
func (e *Engine) Inspect(id string, fn func(ctx *Context) error) error {
	module, ok := e.Registry.Get(id)
	if !ok {
		return moduleNotFound(id)
	}

	r := e.newRun(Request{}, nil)
	defer r.close()

	recalled := e.recall(r)
	r.redactAll(recalled.Secrets)
	r.registry = e.Registry
	r.remembered = recalled

	return fn(r.recalled(module.Manifest(), recalled))
}

func (e *Engine) Deferred() []string {
	kept, err := e.remembered()
	if err != nil {
		return nil
	}

	return kept.Defer
}

func (e *Engine) Config(id string) (contract.ModuleConfig, error) {
	if _, ok := e.Registry.Get(id); !ok {
		return contract.ModuleConfig{}, moduleNotFound(id)
	}

	kept, err := e.remembered()
	if err != nil {
		return contract.ModuleConfig{}, protocol.NewError(contract.ErrorInternal, i18n.T("engine.remembered.unreadable", e.installPath(), err.Error())).
			WithFix(i18n.T("engine.remembered.unreadable.fix", e.installPath()))
	}

	return contract.ModuleConfig{ID: id, Values: kept.Config[id], Secrets: heldSecrets(kept.Secrets[id])}, nil
}

func heldSecrets(values map[string]string) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}

	sort.Strings(keys)

	return keys
}

func (e *Engine) Report() (contract.Report, error) {
	raw, err := os.ReadFile(e.reportPath())
	if errors.Is(err, fs.ErrNotExist) {
		return contract.Report{}, protocol.NewError(contract.ErrorNoReport, i18n.T("engine.report.none")).
			WithFix(i18n.T("engine.report.none.fix"))
	}

	if err != nil {
		return contract.Report{}, err
	}

	var report contract.Report
	if err := json.Unmarshal(raw, &report); err != nil {
		return contract.Report{}, errors.New(i18n.T("engine.report.unreadable", e.reportPath(), err.Error()))
	}

	// Still open with the run lock free: the process died, the kernel released the lock, the file never learnt.
	if report.FinishedAt == "" && e.lockFree() {
		return report.Interrupted(e.now()), nil
	}

	return report, nil
}

func (e *Engine) lockFree() bool {
	release, held, err := lock.Acquire(e.LockPath)
	if err != nil || !held {
		return false
	}

	release()

	return true
}

func (e *Engine) now() time.Time {
	if e.Now == nil {
		return time.Now()
	}

	return e.Now()
}

func (e *Engine) acquire() (func(), error) {
	if !e.licensed() {
		return nil, protocol.LicenseRequired()
	}

	if !e.mu.TryLock() {
		return nil, busy()
	}

	release, err := lockFile(e.LockPath)
	if err != nil {
		e.mu.Unlock()

		return nil, err
	}

	return func() {
		release()
		e.mu.Unlock()
	}, nil
}

func busy() error {
	return protocol.NewError(contract.ErrorBusy, i18n.T("engine.busy")).
		WithFix(i18n.T("engine.busy.fix"))
}

func (e *Engine) licensed() bool {
	current := license.Current
	if e.License != nil {
		current = e.License
	}

	switch current() {
	case contract.LicenseValid, contract.LicenseGrace, contract.LicenseDev:
		return true
	}

	return false
}

func (e *Engine) newRun(request Request, sink Sink) *run {
	r := newRun(runOptions{Sys: e.Sys, Now: e.Now, Emit: sink, LogPath: e.LogPath, ProjectsLock: e.ProjectsLockPath})
	r.redactAll(request.Secrets)

	return r
}

// On disk from the first line: an app whose channel drops reads it back to find where the machine is.
func (e *Engine) start(r *run, action string, modules []Module) contract.Report {
	r.journal.logf("pupitred", "%s : %s", action, idsOf(modules))

	report := contract.Report{
		StartedAt:    r.now().UTC().Format(time.RFC3339),
		AgentVersion: e.AgentVersion,
		Modules:      []contract.ModuleReport{},
		Failed:       []string{},
		ReportPath:   e.reportPath(),
	}

	r.persist = func(report contract.Report) {
		if err := e.writeReport(report); err != nil {
			r.journal.logf("pupitred", "report not written: %s", err)
		}
	}

	r.settled(report)

	return report
}

func (e *Engine) finish(r *run, report contract.Report) (contract.InstallResult, error) {
	report.FinishedAt = r.now().UTC().Format(time.RFC3339)
	report.Warned = append([]string{}, r.warned...)

	if err := e.writeReport(report); err != nil {
		return contract.InstallResult{}, err
	}

	r.journal.logf("pupitred", "%d failure(s), %d warning(s), report: %s", len(report.Failed), len(report.Warned), report.ReportPath)

	return contract.InstallResult{Failed: report.Failed, Warned: report.Warned, ReportPath: report.ReportPath}, nil
}

func (e *Engine) writeReport(report contract.Report) error {
	encoded, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(e.reportPath()), 0o755); err != nil {
		return err
	}

	// The run's own record, not a change to the machine: it bypasses e.Sys like the journal, root-only.
	return sys.Real{}.WriteFile(e.reportPath(), append(encoded, '\n'), 0o600)
}

// Accumulated so a replay from the CLI has every module, value and secret.
func (e *Engine) remember(r *run, request Request, resolved []string) error {
	kept := e.recall(r)
	kept.Modules = union(kept.Modules, request.Modules)
	kept.Config = merge(kept.Config, request.Config)
	kept.Secrets = mergeSecrets(kept.Secrets, request.Secrets)
	kept.Defer = deferredAfter(kept.Defer, request, resolved)

	return e.store(r, kept)
}

func deferredAfter(before []string, request Request, resolved []string) []string {
	var later, answered []string

	for _, id := range resolved {
		if request.Deferred(id) {
			later = append(later, id)
		} else {
			answered = append(answered, id)
		}
	}

	return union(without(before, answered), later)
}

func refuseDeferringMandatory(modules []Module, request Request) error {
	for _, module := range modules {
		manifest := module.Manifest()
		if manifest.Mandatory && request.Deferred(manifest.ID) {
			return protocol.NewError(contract.ErrorBadRequest, i18n.T("engine.defer.mandatory", manifest.ID)).
				WithFix(i18n.T("engine.defer.mandatory.fix", manifest.ID))
		}
	}

	return nil
}

func withoutDeferred(modules []Module, deferred []string) []Module {
	kept := make([]Module, 0, len(modules))
	for _, module := range modules {
		if !slices.Contains(deferred, module.Manifest().ID) {
			kept = append(kept, module)
		}
	}

	return kept
}

func (e *Engine) forget(r *run, ids []string) error {
	if len(ids) == 0 {
		return nil
	}

	kept := e.recall(r)
	kept.Modules = without(kept.Modules, ids)
	kept.Defer = without(kept.Defer, ids)

	for _, id := range ids {
		delete(kept.Config, id)
		delete(kept.Secrets, id)
	}

	return e.store(r, kept)
}

func (e *Engine) recall(r *run) Request {
	request, err := e.remembered()
	if err != nil {
		r.journal.logf("pupitred", "%s unreadable, ignored: %v", e.installPath(), err)
	}

	return request
}

func (e *Engine) remembered() (Request, error) {
	return Remembered(e.Sys, e.installPath())
}

// An unreadable or missing file is an empty request; only malformed JSON is an error.
func Remembered(s sys.Sys, path string) (Request, error) {
	empty := Request{Config: map[string]map[string]any{}, Secrets: map[string]map[string]string{}}

	raw, err := s.ReadFile(path)
	if err != nil {
		return empty, nil
	}

	request := empty
	if err := json.Unmarshal(raw, &request); err != nil {
		return empty, err
	}

	if request.Config == nil {
		request.Config = map[string]map[string]any{}
	}
	if request.Secrets == nil {
		request.Secrets = map[string]map[string]string{}
	}

	return request, nil
}

func (e *Engine) store(r *run, request Request) error {
	encoded, err := json.MarshalIndent(request, "", "  ")
	if err != nil {
		return err
	}

	ctx := r.context(contract.Manifest{ID: "pupitred"}, nil, nil)
	path := e.installPath()
	content := append(encoded, '\n')

	if file.Same(ctx, path, content) {
		return nil
	}

	if err := e.Sys.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}

	return file.WriteAtomic(ctx, path, content, 0o600)
}

func (e *Engine) refuseInstalledConflicts(r *run, selected []Module, recalled Request) error {
	chosen := map[string]bool{}
	for _, module := range selected {
		chosen[module.Manifest().ID] = true
	}

	for _, module := range selected {
		for _, other := range module.Manifest().Conflicts {
			installed, ok := e.Registry.Get(other)
			if chosen[other] || !ok {
				continue
			}

			status, err := installed.Check(r.recalled(installed.Manifest(), recalled))
			if err == nil && status.Installed {
				return protocol.NewError(contract.ErrorBadRequest, i18n.T("engine.conflict.installed", module.Manifest().ID, other)).
					WithFix(i18n.T("engine.conflict.installed.fix", other))
			}
		}
	}

	return nil
}

func (e *Engine) refuseStillRequired(r *run, leaving []Module, recalled Request) error {
	going := map[string]bool{}
	for _, module := range leaving {
		going[module.Manifest().ID] = true
	}

	ours := e.remembersInstalling(recalled)

	for _, module := range e.Registry.All() {
		manifest := module.Manifest()
		if going[manifest.ID] || !ours[manifest.ID] {
			continue
		}

		for _, required := range manifest.Requires {
			if !going[required] {
				continue
			}

			status, err := module.Check(r.recalled(manifest, recalled))
			if err != nil || !status.Installed {
				break
			}

			return protocol.NewError(contract.ErrorBadRequest, i18n.T("modules.uninstall.required", required, manifest.ID)).
				WithFix(i18n.T("modules.uninstall.required.fix", manifest.ID))
		}
	}

	return nil
}

// A package the client installed themselves is theirs: only what install.json remembers is ours.
func (e *Engine) installedAmong(r *run, candidates []Module, recalled Request) []Module {
	ours := e.remembersInstalling(recalled)

	var installed []Module

	for _, module := range candidates {
		if !ours[module.Manifest().ID] {
			continue
		}

		ctx := r.recalled(module.Manifest(), recalled)

		status, err := module.Check(ctx)
		if err != nil {
			ctx.Warn(i18n.T("warn.engine.state.unreadable", err.Error()))
			continue
		}

		if status.Installed {
			installed = append(installed, module)
		}
	}

	ordered, err := order(asMap(installed))
	if err != nil {
		return installed
	}

	return ordered
}

// install.json only carries pulled-in requirements through the modules that named them, hence the resolve.
func (e *Engine) remembersInstalling(recalled Request) map[string]bool {
	ours := map[string]bool{}

	resolved, err := e.Registry.Resolve(recalled.Modules)
	if err != nil {
		for _, id := range recalled.Modules {
			ours[id] = true
		}

		return ours
	}

	for _, module := range resolved {
		ours[module.Manifest().ID] = true
	}

	return ours
}

// Installed but never remembered is the client's own; absent and unremembered is an uninstall already done.
func (e *Engine) refuseForeign(r *run, leaving []Module, recalled Request) error {
	ours := e.remembersInstalling(recalled)

	for _, module := range leaving {
		id := module.Manifest().ID
		if ours[id] {
			continue
		}

		status, err := module.Check(r.recalled(module.Manifest(), recalled))
		if err == nil && status.Installed {
			return protocol.NewError(contract.ErrorBadRequest, i18n.T("engine.uninstall.foreign", id)).
				WithFix(i18n.T("engine.uninstall.foreign.fix", id))
		}
	}

	return nil
}

func (e *Engine) reportPath() string {
	if e.ReportPath == "" {
		return DefaultReportPath
	}

	return e.ReportPath
}

func (e *Engine) installPath() string {
	if e.InstallPath == "" {
		return DefaultInstallPath
	}

	return e.InstallPath
}

func execute(ctx *Context, phase string, fn func() error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			ctx.fail(phase, 0, errors.New(i18n.T("engine.step.panic", recovered)))
		}
	}()

	if err := fn(); err != nil && !ctx.failed {
		ctx.fail(phase, 0, err)
	}
}

func asMap(modules []Module) map[string]Module {
	byID := make(map[string]Module, len(modules))
	for _, module := range modules {
		byID[module.Manifest().ID] = module
	}

	return byID
}

func ids(modules []Module) []string {
	named := make([]string, 0, len(modules))
	for _, module := range modules {
		named = append(named, module.Manifest().ID)
	}

	return named
}

func idsOf(modules []Module) string {
	return strings.Join(ids(modules), ", ")
}

func union(base, extra []string) []string {
	seen := map[string]bool{}
	var result []string

	for _, id := range append(append([]string{}, base...), extra...) {
		if !seen[id] {
			seen[id] = true
			result = append(result, id)
		}
	}

	return result
}

func without(ids, excluded []string) []string {
	skipped := map[string]bool{}
	for _, id := range excluded {
		skipped[id] = true
	}

	result := []string{}
	for _, id := range ids {
		if !skipped[id] {
			result = append(result, id)
		}
	}

	return result
}

// Key by key: a module carries several secrets, and only one changes at a time.
func mergeSecrets(base, extra map[string]map[string]string) map[string]map[string]string {
	if base == nil {
		base = map[string]map[string]string{}
	}

	for id, values := range extra {
		base[id] = merge(base[id], values)
	}

	return base
}

func merge[V any](base, extra map[string]V) map[string]V {
	if base == nil {
		base = map[string]V{}
	}

	for key, value := range extra {
		base[key] = value
	}

	return base
}
