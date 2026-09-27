package state

import (
	"context"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/lock"
	"pupitre.studio/agent/internal/sys/user"
	"pupitre.studio/agent/internal/tmux"
)

const All = "all"

func (r *Reader) List() []contract.Project {
	return r.projects()
}

func (r *Reader) Declared() ([]contract.Project, error) {
	if _, err := r.declared(); err != nil {
		return nil, err
	}

	return r.projects(), nil
}

// Steps after the row is written only warn: a retry would merely be told the project is already declared.
type Declared struct {
	contract.Project
	Warnings []string `json:"warnings,omitempty"`
}

// All the request can be judged on is judged before the row is written; later refusals of the machine become warnings.
func (r *Reader) Add(project registry.Project, processes []ProcessRequest) (Declared, error) {
	ctx := r.ctx()

	resolved, err := resolveProcesses(r.domain(), processes)
	if err != nil {
		return Declared{}, err
	}

	project.Processes = resolved

	if err := r.checkRuntimes(project.Runtimes); err != nil {
		return Declared{}, err
	}

	if err := r.roomForClone(project); err != nil {
		return Declared{}, err
	}

	if err := r.roomForFolders(project); err != nil {
		return Declared{}, err
	}

	var warnings []string

	err = r.rewrite(func(reg *registry.File) error {
		if err := reg.Add(ctx, project); err != nil {
			return err
		}

		warnings = r.warn(warnings, "state.project.warning.hosts", syncLocalNames(ctx, reg))

		return nil
	})
	if err != nil {
		return Declared{}, err
	}

	warnings = r.warn(warnings, "state.project.warning.dir", r.makeFolders(project, project.Processes))
	warnings = r.warn(warnings, "state.project.warning.pin", r.pinRuntimes(project))

	return r.answer(project.Name, warnings)
}

// A repository brings its folders with the clone, and git refuses to clone into a folder already holding them.
func (r *Reader) makeFolders(project registry.Project, processes []registry.Process) error {
	if project.Repo != "" && project.Repo != "-" {
		return nil
	}

	ctx := r.ctx()
	owner := r.options.Tmux.User
	path := project.Path(r.options.Paths.Resolved().Projects)

	for _, process := range processes {
		if err := file.MkdirOwned(ctx, process.Path(path), owner, owner, 0o755); err != nil {
			return err
		}
	}

	return nil
}

func (r *Reader) roomForFolders(project registry.Project) error {
	if project.Repo != "" && project.Repo != "-" {
		return nil
	}

	path := project.Path(r.options.Paths.Resolved().Projects)

	for _, process := range project.Processes {
		dir := process.Path(path)
		if _, _, err := r.ctx().Sys().Stat(dir); err == nil {
			return protocol.NewError(contract.ErrorBadRequest, i18n.T("state.project.dir.file", project.Window(process.ID), dir)).
				WithFix(i18n.T("state.project.dir.file.fix"))
		}
	}

	return nil
}

func (r *Reader) warn(warnings []string, key string, err error) []string {
	if err == nil {
		return warnings
	}

	r.ctx().Logf("%s", err)

	return append(warnings, i18n.T(key, err.Error()))
}

func (r *Reader) answer(name string, warnings []string) (Declared, error) {
	project, err := r.one(name)
	if err != nil {
		return Declared{}, err
	}

	return Declared{Project: project, Warnings: warnings}, nil
}

// git clones only into a folder that is absent, empty, or already holding that very repository.
func (r *Reader) roomForClone(project registry.Project) error {
	if project.Repo == "" || project.Repo == "-" {
		return nil
	}

	ctx := r.ctx()
	root := project.RootPath(r.options.Paths.Resolved().Projects)
	if !file.Exists(ctx, root) {
		return nil
	}

	if exists, _ := ctx.Sys().Exists(root + "/.git"); exists {
		if held, other := r.otherRepository(project, root); other {
			return protocol.NewError(contract.ErrorBadRequest, i18n.T("state.project.repo.other", project.Name, held)).
				WithFix(i18n.T("state.project.repo.other.fix", root, project.Repo))
		}

		return nil
	}

	entries, err := file.List(ctx, root)
	if err != nil || len(entries) == 0 {
		return nil
	}

	return protocol.NewError(contract.ErrorBadRequest, i18n.T("state.project.dir.busy", project.Name, root)).
		WithFix(i18n.T("state.project.dir.busy.fix", project.Repo))
}

type ProcessRequest struct {
	ID        string
	Dir       string
	PkgMgr    string
	Host      string
	Port      int
	Cmd       string
	Install   string
	Routes    []registry.RouteRequest
	Protected *bool
}

func resolveProcesses(domain string, requests []ProcessRequest) ([]registry.Process, error) {
	processes := make([]registry.Process, 0, len(requests))

	for _, request := range requests {
		routes, err := registry.ResolveRoutes(domain, request.Routes)
		if err != nil {
			return nil, err
		}

		processes = append(processes, registry.Process{
			ID:        request.ID,
			Dir:       request.Dir,
			PkgMgr:    request.PkgMgr,
			Host:      request.Host,
			Port:      request.Port,
			Routes:    routes,
			Cmd:       request.Cmd,
			Install:   request.Install,
			Protected: request.Protected,
		})
	}

	return processes, nil
}

// A nil field is left unchanged; Processes replaces the whole list.
type UpdatePatch struct {
	Branch    *string
	Boot      *bool
	Runtimes  *map[string]string
	Protected *bool
	Processes *[]ProcessRequest
}

// Only a running process whose command or folder changed restarts; a route or a branch touches nothing that runs.
func (r *Reader) Update(name string, patch UpdatePatch) (Declared, error) {
	ctx := r.ctx()

	change := registry.Patch{Branch: patch.Branch, Boot: patch.Boot, Runtimes: patch.Runtimes, Protected: patch.Protected}

	if patch.Runtimes != nil {
		if err := r.checkRuntimes(*patch.Runtimes); err != nil {
			return Declared{}, err
		}
	}

	if patch.Processes != nil {
		resolved, err := resolveProcesses(r.domain(), *patch.Processes)
		if err != nil {
			return Declared{}, err
		}

		change.Processes = &resolved
	}

	var current, updated registry.Project
	var warnings []string

	err := r.rewrite(func(reg *registry.File) error {
		known := false
		current, known = reg.Get(name)
		if !known {
			return registry.NotFound(name)
		}

		var err error
		updated, err = reg.Update(ctx, name, change)
		if err != nil {
			return err
		}

		warnings = r.warn(warnings, "state.project.warning.hosts", syncLocalNames(ctx, reg))

		return nil
	})
	if err != nil {
		return Declared{}, err
	}

	if patch.Processes != nil {
		warnings = r.warn(warnings, "state.project.warning.dir", r.makeFolders(updated, added(current, updated)))
	}

	if patch.Runtimes != nil {
		warnings = r.warn(warnings, "state.project.warning.pin", r.pinRuntimes(updated))
	}

	for _, was := range current.Processes {
		now, kept := updated.Process(was.ID)
		if kept && now.Cmd == was.Cmd && now.Dir == was.Dir {
			continue
		}

		window := current.Window(was.ID)
		ran := tmux.Running(ctx, r.options.Tmux, window)

		// A pane whose command died is still a window, and a removed process is still on the record: both go.
		if !kept || tmux.Open(ctx, r.options.Tmux, window) {
			if err := r.stop(current, was); err != nil {
				warnings = append(warnings, i18n.T("state.project.warning.stop", window, err.Error()))

				continue
			}
		}

		if kept && ran {
			if err := r.start(updated, now); err != nil {
				warnings = append(warnings, i18n.T("state.project.warning.start", window, err.Error()))
			}
		}
	}

	return r.answer(name, warnings)
}

func added(before, after registry.Project) []registry.Process {
	var fresh []registry.Process

	for _, process := range after.Processes {
		if _, held := before.Process(process.ID); !held {
			fresh = append(fresh, process)
		}
	}

	return fresh
}

// Removable is checked before anything is stopped: the refusal is the whole answer.
func (r *Reader) Remove(name string) (contract.Project, error) {
	ctx := r.ctx()

	reg, err := r.declared()
	if err != nil {
		return contract.Project{}, err
	}

	if err := reg.Removable(name); err != nil {
		return contract.Project{}, err
	}

	project, _ := reg.Get(name)

	for _, process := range project.Processes {
		if err := r.stop(project, process); err != nil {
			return contract.Project{}, err
		}
	}

	var removed registry.Project

	err = r.rewrite(func(reg *registry.File) error {
		var err error
		removed, err = reg.Remove(ctx, name)
		if err != nil {
			return err
		}

		return syncLocalNames(ctx, r.registry())
	})
	if err != nil {
		return contract.Project{}, err
	}

	return removed.Contract(r.options.Paths.Resolved().Projects), nil
}

func (r *Reader) Up(target, process string) (contract.ProjectActionResult, error) {
	return r.act(target, process, r.start)
}

func (r *Reader) Down(target, process string) (contract.ProjectActionResult, error) {
	return r.act(target, process, r.stop)
}

func (r *Reader) Restart(target, process string) (contract.ProjectActionResult, error) {
	return r.act(target, process, func(project registry.Project, process registry.Process) error {
		if err := r.stop(project, process); err != nil {
			return err
		}

		return r.start(project, process)
	})
}

func (r *Reader) start(project registry.Project, process registry.Process) error {
	return r.startWith(project, process, process.Cmd)
}

func (r *Reader) startWith(project registry.Project, process registry.Process, command string) error {
	ctx := r.ctx()
	window := project.Window(process.ID)

	if tmux.Running(ctx, r.options.Tmux, window) {
		return nil
	}

	dir := process.Path(project.Path(r.options.Paths.Resolved().Projects))
	if !file.Exists(ctx, dir) {
		return protocol.NewError(contract.ErrorProjectNotFound, i18n.T("state.project.dir.missing", window, dir)).
			WithFix(i18n.T("state.project.sync.fix", project.Name))
	}

	job := tmux.Job{Window: window, Dir: dir, Cmd: command, Env: r.processEnvironment(project, process)}
	if err := tmux.Start(ctx, r.options.Tmux, job); err != nil {
		return err
	}

	return r.note(window, true)
}

func (r *Reader) declared() (*registry.File, error) {
	reg := r.registry()
	if err := reg.Problem(); err != nil {
		return nil, err
	}

	return reg, nil
}

// Under the cross-session lock, so a project.add and a domain move on two channels never overwrite each other.
func (r *Reader) rewrite(change func(*registry.File) error) error {
	release, err := r.hold()
	if err != nil {
		return err
	}
	defer release()

	reg, err := r.declared()
	if err != nil {
		return err
	}

	if err := change(reg); err != nil {
		return err
	}

	r.healEnvironment(r.registry())

	return nil
}

// A window whose command died is still a window: a stop closes it, so it does not read as a failure forever.
func (r *Reader) stop(project registry.Project, process registry.Process) error {
	ctx := r.ctx()
	window := project.Window(process.ID)

	if tmux.Open(ctx, r.options.Tmux, window) {
		if err := tmux.Stop(ctx, r.options.Tmux, window); err != nil {
			return err
		}
	}

	return r.note(window, false)
}

// A "service" process is systemd's: neither a project nor "all" starts or stops it.
func (r *Reader) act(target, id string, apply func(registry.Project, registry.Process) error) (contract.ProjectActionResult, error) {
	file, err := r.declared()
	if err != nil {
		return contract.ProjectActionResult{}, err
	}

	if target != All {
		project, known := file.Get(target)
		if !known {
			return contract.ProjectActionResult{}, registry.NotFound(target)
		}

		processes := project.Processes
		if id != "" {
			process, declared := project.Process(id)
			if !declared {
				return contract.ProjectActionResult{}, processNotFound(target, id)
			}

			processes = []registry.Process{process}
		}

		for _, process := range processes {
			if process.IsService() {
				continue
			}

			if err := apply(project, process); err != nil {
				return contract.ProjectActionResult{}, err
			}
		}

		current, err := r.one(target)
		if err != nil {
			return contract.ProjectActionResult{}, err
		}

		return contract.ProjectActionResult{State: current.State}, nil
	}

	for _, project := range file.Projects {
		for _, process := range project.Processes {
			if process.IsService() {
				continue
			}

			if err := apply(project, process); err != nil {
				return contract.ProjectActionResult{}, err
			}
		}
	}

	return r.summary(), nil
}

func processNotFound(project, id string) error {
	return protocol.NewError(contract.ErrorProjectNotFound, i18n.T("state.process.unknown", id, project)).
		WithFix(i18n.T("state.process.unknown.fix"))
}

func (r *Reader) summary() contract.ProjectActionResult {
	result := contract.ProjectActionResult{State: contract.ProjectStopped, Projects: []contract.ProjectStateEntry{}}

	for _, project := range r.projects() {
		result.Projects = append(result.Projects, contract.ProjectStateEntry{Name: project.Name, State: project.State})
		if project.State == contract.ProjectOnline || project.State == contract.ProjectStarting || project.State == contract.ProjectPartial {
			result.State = contract.ProjectOnline
		}
	}

	return result
}

func (r *Reader) one(name string) (contract.Project, error) {
	for _, project := range r.projects() {
		if project.Name == name {
			return project, nil
		}
	}

	return contract.Project{}, registry.NotFound(name)
}

func (r *Reader) window(name, id string) (registry.Project, registry.Process, error) {
	project, err := r.project(name)
	if err != nil {
		return registry.Project{}, registry.Process{}, err
	}

	process, declared := project.Process(id)
	if !declared {
		return registry.Project{}, registry.Process{}, processNotFound(name, id)
	}

	return project, process, nil
}

func (r *Reader) Logs(name, id string, lines int) ([]string, error) {
	project, _, err := r.window(name, id)
	if err != nil {
		return nil, err
	}

	return tmux.Logs(r.ctx(), r.options.Tmux, project.Window(id), lines)
}

// Newline-less output cannot grow a root process without bound, nor one burst deliver megabytes in a single poll.
const (
	followPartialLimit = 64 << 10
	followReadLimit    = 1 << 20
)

func (r *Reader) Follow(channel context.Context, name, id string, lines int, emit func(string)) error {
	tail, err := r.Logs(name, id, lines)
	if err != nil {
		return err
	}

	for _, line := range tail {
		emit(line)
	}

	ctx := r.ctx()
	path := r.options.Tmux.LogPath(registry.Window(name, id))
	seen := r.size(path)
	partial := ""
	deadline := r.options.Now().Add(r.options.Follow.Limit)

	for channel.Err() == nil && r.options.Now().Before(deadline) {
		r.pause(channel, r.options.Follow.Interval)

		// A restart empties the journal; the follow outlives the process and starts over.
		if r.size(path) < seen {
			seen = 0
			partial = ""
		}

		raw, readErr := file.From(ctx, path, seen)
		if readErr != nil || len(raw) == 0 {
			continue
		}

		// Only a burst's end is kept: its start is hours old by the time the reader sees it.
		if len(raw) > followReadLimit {
			skipped := int64(len(raw) - followReadLimit)
			seen += skipped
			raw = raw[skipped:]
		}

		seen += int64(len(raw))

		// A line travels once whole: a read may land mid-line, on a progress bar or a download counter.
		pieces := strings.Split(partial+string(raw), "\n")
		partial = pieces[len(pieces)-1]

		for _, line := range pieces[:len(pieces)-1] {
			emit(line)
		}

		// A stretch this long without a newline leaves as it stands rather than grow until the deadline.
		if len(partial) > followPartialLimit {
			emit(partial)
			partial = ""
		}
	}

	return nil
}

func (r *Reader) size(path string) int64 {
	size, _, err := r.ctx().Sys().Stat(path)
	if err != nil {
		return 0
	}

	return size
}

func (r *Reader) pause(channel context.Context, delay time.Duration) {
	if r.options.Follow.Sleep != nil {
		r.options.Follow.Sleep(delay)

		return
	}

	timer := time.NewTimer(delay)
	defer timer.Stop()

	select {
	case <-channel.Done():
	case <-timer.C:
	}
}

// The lock ends with the session, so a retry after a cut finds it free rather than a twin still running.
func (r *Reader) withInstallLock(fn func() error) error {
	path := r.options.InstallLock
	if path == "" {
		return fn()
	}

	release, held, err := lock.Acquire(path)
	if err != nil {
		return err
	}

	if !held {
		return protocol.NewError(contract.ErrorBusy, i18n.T("state.project.busy")).
			WithFix(i18n.T("state.project.busy.fix"))
	}
	defer release()

	return fn()
}

func (r *Reader) Install(channel context.Context, name, id string, emit func(string)) ([]contract.ProcessInstall, error) {
	var installed []contract.ProcessInstall

	err := r.withInstallLock(func() error {
		var lockErr error
		installed, lockErr = r.install(channel, name, id, emit)

		return lockErr
	})

	return installed, err
}

func (r *Reader) install(channel context.Context, name, id string, emit func(string)) ([]contract.ProcessInstall, error) {
	project, err := r.project(name)
	if err != nil {
		return nil, err
	}

	processes := project.Processes
	if id != "" {
		process, declared := project.Process(id)
		if !declared {
			return nil, processNotFound(name, id)
		}

		processes = []registry.Process{process}
	}

	ctx := r.ctx()
	path := project.Path(r.options.Paths.Resolved().Projects)
	installed := []contract.ProcessInstall{}

	for _, process := range processes {
		command := process.InstallCommand()
		if command == "" {
			continue
		}

		dir := process.Path(path)
		if !file.Exists(ctx, dir) {
			return installed, protocol.NewError(contract.ErrorProjectNotFound, i18n.T("state.project.dir.missing", project.Window(process.ID), dir)).
				WithFix(i18n.T("state.project.sync.fix", name))
		}

		// How dependencies were installed should never be a guess.
		ctx.Logf("%s : %s", project.Window(process.ID), command)

		// A shell honours the line's "&&" and variables; the line is one argv word and runs as dev, never root.
		if err := user.StreamIn(channel, ctx, r.options.Tmux.User, dir, emit, "zsh", "-lc", command); err != nil {
			return installed, protocol.NewError(contract.ErrorInternal, i18n.T("state.project.install.failed", project.Window(process.ID), command)).
				WithFix(i18n.T("state.project.install.failed.fix"))
		}

		installed = append(installed, contract.ProcessInstall{Process: process.ID, Command: command})
	}

	return installed, nil
}

func (r *Reader) URL(name string) (string, error) {
	project, err := r.project(name)
	if err != nil {
		return "", err
	}

	return project.URL(), nil
}

func (r *Reader) project(name string) (registry.Project, error) {
	reg, err := r.declared()
	if err != nil {
		return registry.Project{}, err
	}

	project, known := reg.Get(name)
	if !known {
		return registry.Project{}, registry.NotFound(name)
	}

	return project, nil
}

// dev writes the repository, so HEAD is read inside the projects root, never through a link leaving it.
func head(ctx sys.Context, projects, dir string) string {
	raw, err := ctx.Sys().ReadFileIn(projects, dir+"/.git/HEAD")
	if err != nil {
		return ""
	}

	text := strings.TrimSpace(string(raw))
	if reference, found := strings.CutPrefix(text, "ref: refs/heads/"); found {
		return reference
	}

	if len(text) >= 7 {
		return text[:7]
	}

	return text
}

const debugFlag = "-PdebugPort="

// The debug port is declared per window, not guessed: a gradle row is not necessarily a JVM server.
func (r *Reader) Debug(name, id string) (contract.ProjectDebug, error) {
	project, process, err := r.window(name, id)
	if err != nil {
		return contract.ProjectDebug{}, err
	}

	window := project.Window(id)
	if process.IsService() {
		return contract.ProjectDebug{}, protocol.NewError(contract.ErrorBadRequest, i18n.T("state.debug.service", window)).
			WithFix(i18n.T("state.debug.service.fix"))
	}

	port, declared := r.debugPort(window)
	if !declared {
		return contract.ProjectDebug{}, protocol.NewError(contract.ErrorBadRequest, i18n.T("state.debug.undeclared", window)).
			WithFix(i18n.T("state.debug.undeclared.fix", env.DebugPortsKey, window))
	}

	if err := r.stop(project, process); err != nil {
		return contract.ProjectDebug{}, err
	}

	if err := r.startWith(project, process, process.Cmd+" "+debugFlag+strconv.Itoa(port)); err != nil {
		return contract.ProjectDebug{}, err
	}

	current, err := r.one(name)
	if err != nil {
		return contract.ProjectDebug{}, err
	}

	for _, running := range current.Processes {
		if running.ID == id {
			return contract.ProjectDebug{State: running.State, Port: running.Port, DebugPort: port}, nil
		}
	}

	return contract.ProjectDebug{}, processNotFound(name, id)
}

// Format: "project/process:port project/process:port".
func (r *Reader) debugPort(window string) (int, bool) {
	value, _, err := env.Get(r.ctx(), env.DebugPortsKey)
	if err != nil {
		return 0, false
	}

	// systemd's EnvironmentFile needs a spaced value quoted, and env.Get returns it with its quotes.
	for _, entry := range strings.Fields(strings.Trim(value, `"'`)) {
		declared, raw, split := strings.Cut(entry, ":")
		if !split || declared != window {
			continue
		}

		port, convErr := strconv.Atoi(raw)
		if convErr != nil || port < 1 || port > registry.LastPort {
			return 0, false
		}

		return port, true
	}

	return 0, false
}
