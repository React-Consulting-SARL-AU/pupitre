package modules

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"pupitre.sh/agent/internal/contract"
	"pupitre.sh/agent/internal/entitlement"
	"pupitre.sh/agent/internal/protocol"
	"pupitre.sh/agent/internal/sys"
	"pupitre.sh/agent/internal/sys/file"
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
	Modules []string                     `json:"modules"`
	Config  map[string]map[string]any    `json:"config"`
	Secrets map[string]map[string]string `json:"secrets,omitempty"`
	Persist bool                         `json:"-"`
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

	if request.Persist {
		if err := e.remember(r, request); err != nil {
			return contract.InstallResult{}, err
		}
	}

	report := e.start(r, "install", modules)
	for _, module := range modules {
		ctx := r.context(module.Manifest(), request.Config[module.Manifest().ID], request.Secrets[module.Manifest().ID])

		execute(ctx, "install", func() error { return module.Install(ctx) })
		if !ctx.failed {
			execute(ctx, "configure", func() error { return module.Configure(ctx) })
		}

		report.Modules = append(report.Modules, ctx.report())
		report.Failed = append(report.Failed, ctx.failures()...)
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
		report.Failed = append(report.Failed, ctx.failures()...)
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
		result.Failed = append(result.Failed, ctx.failures()...)
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

func (e *Engine) Report() (contract.Report, error) {
	raw, err := os.ReadFile(e.reportPath())
	if errors.Is(err, fs.ErrNotExist) {
		return contract.Report{}, protocol.NewError(contract.ErrorNoReport, "aucun rapport : aucune installation n'a encore eu lieu sur ce serveur").
			WithFix("Lance install depuis l'app, ou sudo pupitred install sur le serveur.")
	}

	if err != nil {
		return contract.Report{}, err
	}

	var report contract.Report
	if err := json.Unmarshal(raw, &report); err != nil {
		return contract.Report{}, fmt.Errorf("rapport illisible %s : %w", e.reportPath(), err)
	}

	return report, nil
}

func (e *Engine) acquire() (func(), error) {
	if !e.entitled() {
		return nil, protocol.EntitlementRequired()
	}

	if !e.mu.TryLock() {
		return nil, protocol.NewError(contract.ErrorBusy, "une installation est déjà en cours").
			WithFix("Attends la fin de l'installation en cours.")
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

	r.journal.logf("pupitred", "%d échec(s), %d avertissement(s), rapport : %s", len(report.Failed), len(report.Warned), report.ReportPath)

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
	kept.Secrets = merge(kept.Secrets, request.Secrets)

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
	request := Request{Config: map[string]map[string]any{}, Secrets: map[string]map[string]string{}}

	raw, err := e.Sys.ReadFile(e.installPath())
	if err != nil {
		return request
	}

	if err := json.Unmarshal(raw, &request); err != nil {
		r.journal.logf("pupitred", "%s illisible, ignoré : %v", e.installPath(), err)
	}

	return request
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
				return protocol.NewError(contract.ErrorBadRequest, fmt.Sprintf("%s est en conflit avec %s, déjà installé", module.Manifest().ID, other)).
					WithFix(fmt.Sprintf("Désinstalle %s d'abord.", other))
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
			ctx.Warn("état illisible, mise à jour ignorée : " + err.Error())
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
			ctx.fail(phase, 0, fmt.Errorf("panique : %v", recovered))
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

func merge[V any](base, extra map[string]V) map[string]V {
	if base == nil {
		base = map[string]V{}
	}

	for key, value := range extra {
		base[key] = value
	}

	return base
}
