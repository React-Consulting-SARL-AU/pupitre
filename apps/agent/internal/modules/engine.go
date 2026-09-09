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
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	DefaultReportPath  = "/var/lib/pupitre/report.json"
	DefaultLogPath     = "/var/log/pupitre.log"
	DefaultInstallPath = "/etc/pupitre/install.json"
)

type Engine struct {
	Registry     *Registry
	Sys          sys.Sys
	Now          func() time.Time
	Entitlement  func() contract.Entitlement
	AgentVersion string
	ReportPath   string
	LogPath      string
	InstallPath  string

	mu sync.Mutex
}

type Request struct {
	Modules []string                  `json:"modules"`
	Config  map[string]map[string]any `json:"config"`
	// Defer names the modules to install without configuring: their fields are
	// not weighed, their Configure step does not run, and they report themselves
	// installed and not configured until someone finishes them.
	Defer   []string                     `json:"defer,omitempty"`
	Secrets map[string]map[string]string `json:"secrets,omitempty"`
	Persist bool                         `json:"-"`
}

// Deferred says whether this module is one the caller asked to leave unconfigured.
func (r Request) Deferred(id string) bool {
	return slices.Contains(r.Defer, id)
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

	if err := e.refuseInstalledConflicts(r, modules); err != nil {
		return contract.InstallResult{}, err
	}

	// A secret the app does not send back is a secret left unchanged: reconfiguring a port must not clear the password.
	request.Secrets = mergeSecrets(e.recall(r).Secrets, request.Secrets)
	r.redactAll(request.Secrets)

	// Nothing is touched on a configuration that would not hold: a module used to
	// find its own missing field halfway through, and left the machine there.
	if problems := fieldProblems(modules, request); len(problems) > 0 {
		return contract.InstallResult{}, invalidConfig(problems)
	}

	if request.Persist {
		if err := e.remember(r, request); err != nil {
			return contract.InstallResult{}, err
		}
	}

	report := e.start(r, "install", modules)
	for _, module := range modules {
		ctx := r.context(module.Manifest(), request.Config[module.Manifest().ID], request.Secrets[module.Manifest().ID])

		execute(ctx, "install", func() error { return module.Install(ctx) })

		// A module left for later is put on the machine and no further: nothing
		// of it is configured, so nothing of it can be half-configured.
		if !(ctx.failed || request.Deferred(module.Manifest().ID)) {
			execute(ctx, "configure", func() error { return module.Configure(ctx) })
		}

		report.Modules = append(report.Modules, ctx.report())
		if ctx.failed {
			report.Failed = append(report.Failed, ctx.manifest.ID)
		}
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

	modules := e.installedAmong(r, candidates)
	report := e.start(r, "upgrade", modules)

	for _, module := range modules {
		ctx := r.context(module.Manifest(), request.Config[module.Manifest().ID], request.Secrets[module.Manifest().ID])
		execute(ctx, "upgrade", func() error { return module.Upgrade(ctx) })

		report.Modules = append(report.Modules, ctx.report())
		if ctx.failed {
			report.Failed = append(report.Failed, ctx.manifest.ID)
		}
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
	r.redactAll(e.recall(r).Secrets)

	result := contract.UninstallResult{Failed: []string{}}
	var removed []string
	r.journal.logf("pupitred", "uninstall : %s", idsOf(modules))

	for i := len(modules) - 1; i >= 0; i-- {
		module := modules[i]
		ctx := r.context(module.Manifest(), nil, nil)

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

// A command of a module (harden, db.dump…) runs under the same entitlement, lock, journal and remembered values as install.
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

	return fn(r.context(module.Manifest(), recalled.Config[id], recalled.Secrets[id]))
}

// Config returns what should be put back into the form for an already-installed module.
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

	return report, nil
}

func (e *Engine) acquire() (func(), error) {
	if !e.entitled() {
		return nil, protocol.EntitlementRequired()
	}

	if !e.mu.TryLock() {
		return nil, protocol.NewError(contract.ErrorBusy, i18n.T("engine.busy")).
			WithFix(i18n.T("engine.busy.fix"))
	}

	return e.mu.Unlock, nil
}

func (e *Engine) entitled() bool {
	current := entitlement.Current
	if e.Entitlement != nil {
		current = e.Entitlement
	}

	switch current() {
	case contract.EntitlementValid, contract.EntitlementGrace, contract.EntitlementDev:
		return true
	}

	return false
}

func (e *Engine) newRun(request Request, sink Sink) *run {
	r := newRun(runOptions{Sys: e.Sys, Now: e.Now, Emit: sink, LogPath: e.LogPath})
	r.redactAll(request.Secrets)

	return r
}

func (e *Engine) start(r *run, action string, modules []Module) contract.Report {
	r.journal.logf("pupitred", "%s : %s", action, idsOf(modules))

	return contract.Report{
		StartedAt:    r.now().UTC().Format(time.RFC3339),
		AgentVersion: e.AgentVersion,
		Modules:      []contract.ModuleReport{},
		Failed:       []string{},
		ReportPath:   e.reportPath(),
	}
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

	return sys.Real{}.WriteFile(e.reportPath(), append(encoded, '\n'), 0o644)
}

// install.json accumulates what the app asked for, so a replay from the CLI has every module, value and secret.
func (e *Engine) remember(r *run, request Request) error {
	kept := e.recall(r)
	kept.Modules = union(kept.Modules, request.Modules)
	kept.Config = merge(kept.Config, request.Config)
	kept.Secrets = mergeSecrets(kept.Secrets, request.Secrets)

	return e.store(r, kept)
}

func (e *Engine) forget(r *run, ids []string) error {
	if len(ids) == 0 {
		return nil
	}

	kept := e.recall(r)
	kept.Modules = without(kept.Modules, ids)
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
	empty := Request{Config: map[string]map[string]any{}, Secrets: map[string]map[string]string{}}

	raw, err := e.Sys.ReadFile(e.installPath())
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

func (e *Engine) refuseInstalledConflicts(r *run, selected []Module) error {
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

			status, err := installed.Check(r.context(installed.Manifest(), nil, nil))
			if err == nil && status.Installed {
				return protocol.NewError(contract.ErrorBadRequest, i18n.T("engine.conflict.installed", module.Manifest().ID, other)).
					WithFix(i18n.T("engine.conflict.installed.fix", other))
			}
		}
	}

	return nil
}

func (e *Engine) installedAmong(r *run, candidates []Module) []Module {
	var installed []Module
	for _, module := range candidates {
		ctx := r.context(module.Manifest(), nil, nil)

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

func idsOf(modules []Module) string {
	ids := make([]string, 0, len(modules))
	for _, module := range modules {
		ids = append(ids, module.Manifest().ID)
	}

	return strings.Join(ids, ", ")
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

// mergeSecrets merges key by key: a module carries several secrets, and only one changes at a time.
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
