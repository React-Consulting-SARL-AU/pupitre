package state

import (
	"pupitre.studio/agent/internal/i18n"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
	"pupitre.studio/agent/internal/tmux"
)

const All = "all"

func (r *Reader) List() []contract.Project {
	return r.projects()
}

// Add declares a project, resolving each name on the web once, from the domain this machine publishes under.
func (r *Reader) Add(project registry.Project, routes []registry.RouteRequest) (contract.Project, error) {
	ctx := r.ctx()
	reg := r.registry()

	if project.Host == "" {
		project.Host = registry.Loopback
	}

	resolved, err := registry.ResolveRoutes(reg.Domain, routes)
	if err != nil {
		return contract.Project{}, err
	}
	project.Routes = resolved

	if err := reg.Add(ctx, project); err != nil {
		return contract.Project{}, err
	}

	if err := syncLocalNames(ctx, reg); err != nil {
		return contract.Project{}, err
	}

	owner := r.options.Tmux.User
	paths := r.options.Paths.Resolved()
	for _, dir := range []string{project.RootPath(paths.Projects), project.Path(paths.Projects)} {
		if err := file.MkdirOwned(ctx, dir, owner, owner, 0o755); err != nil {
			return contract.Project{}, err
		}
	}

	return r.one(project.Name)
}

// An UpdatePatch is what project.update carries: a nil field is left as it was, and a routes list replaces the whole of the last one.
type UpdatePatch struct {
	Cmd     *string
	Install *string
	Branch  *string
	Routes  *[]registry.RouteRequest
}

// Update rewrites the row, and restarts the project only when its command changed and it was running: a route or a branch changes nothing of what runs.
func (r *Reader) Update(name string, patch UpdatePatch) (contract.Project, error) {
	ctx := r.ctx()
	file := r.registry()

	current, known := file.Get(name)
	if !known {
		return contract.Project{}, registry.NotFound(name)
	}

	change := registry.Patch{Cmd: patch.Cmd, Install: patch.Install, Branch: patch.Branch}
	if patch.Routes != nil {
		resolved, err := registry.ResolveRoutes(file.Domain, *patch.Routes)
		if err != nil {
			return contract.Project{}, err
		}
		change.Routes = &resolved
	}

	updated, err := file.Update(ctx, name, change)
	if err != nil {
		return contract.Project{}, err
	}

	if updated.Cmd != current.Cmd && tmux.Running(ctx, r.options.Tmux, name) {
		if err := r.stop(updated); err != nil {
			return contract.Project{}, err
		}

		if err := r.start(updated); err != nil {
			return contract.Project{}, err
		}
	}

	return r.one(name)
}

func (r *Reader) Remove(name string) (contract.Project, error) {
	ctx := r.ctx()
	file := r.registry()

	if tmux.Running(ctx, r.options.Tmux, name) {
		if err := tmux.Stop(ctx, r.options.Tmux, name); err != nil {
			return contract.Project{}, err
		}
	}

	removed, err := file.Remove(ctx, name)
	if err != nil {
		return contract.Project{}, err
	}

	if err := syncLocalNames(ctx, r.registry()); err != nil {
		return contract.Project{}, err
	}

	return removed.Contract(r.options.Paths.Resolved().Projects), nil
}

func (r *Reader) Up(target string) (contract.ProjectActionResult, error) {
	return r.act(target, r.start)
}

func (r *Reader) Down(target string) (contract.ProjectActionResult, error) {
	return r.act(target, r.stop)
}

func (r *Reader) Restart(target string) (contract.ProjectActionResult, error) {
	return r.act(target, func(project registry.Project) error {
		if err := r.stop(project); err != nil {
			return err
		}

		return r.start(project)
	})
}

func (r *Reader) start(project registry.Project) error {
	return r.startWith(project, project.Cmd)
}

func (r *Reader) startWith(project registry.Project, command string) error {
	ctx := r.ctx()
	if tmux.Running(ctx, r.options.Tmux, project.Name) {
		return nil
	}

	dir := project.Path(r.options.Paths.Resolved().Projects)
	if !file.Exists(ctx, dir) {
		return protocol.NewError(contract.ErrorProjectNotFound, i18n.T("state.project.dir.missing", project.Name, dir)).
			WithFix(i18n.T("state.project.sync.fix", project.Name))
	}

	return tmux.Start(ctx, r.options.Tmux, tmux.Job{Project: project.Name, Dir: dir, Cmd: command})
}

func (r *Reader) stop(project registry.Project) error {
	ctx := r.ctx()
	if !tmux.Running(ctx, r.options.Tmux, project.Name) {
		return nil
	}

	return tmux.Stop(ctx, r.options.Tmux, project.Name)
}

// A "service" row is systemd's business: it shows in the state, and "all" never starts or stops it.
func (r *Reader) act(target string, apply func(registry.Project) error) (contract.ProjectActionResult, error) {
	file := r.registry()

	if target != All {
		project, known := file.Get(target)
		if !known {
			return contract.ProjectActionResult{}, registry.NotFound(target)
		}

		if err := apply(project); err != nil {
			return contract.ProjectActionResult{}, err
		}

		current, err := r.one(target)
		if err != nil {
			return contract.ProjectActionResult{}, err
		}

		return contract.ProjectActionResult{State: current.State, Port: current.Port}, nil
	}

	for _, project := range file.Projects {
		if project.IsService() {
			continue
		}

		if err := apply(project); err != nil {
			return contract.ProjectActionResult{}, err
		}
	}

	return r.summary(), nil
}

func (r *Reader) summary() contract.ProjectActionResult {
	result := contract.ProjectActionResult{State: contract.ProjectStopped, Projects: []contract.ProjectStateEntry{}}

	for _, project := range r.projects() {
		result.Projects = append(result.Projects, contract.ProjectStateEntry{Name: project.Name, State: project.State, Port: project.Port})
		if project.State == contract.ProjectOnline || project.State == contract.ProjectStarting {
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

func (r *Reader) Logs(name string, lines int) ([]string, error) {
	if _, known := r.registry().Get(name); !known {
		return nil, registry.NotFound(name)
	}

	return tmux.Logs(r.ctx(), r.options.Tmux, name, lines)
}

// With follow every line travels as an event, the tail included: the app must never receive the newest lines before the oldest.
func (r *Reader) Follow(name string, lines int, emit func(string)) error {
	tail, err := r.Logs(name, lines)
	if err != nil {
		return err
	}

	for _, line := range tail {
		emit(line)
	}

	ctx := r.ctx()
	path := r.options.Tmux.LogPath(name)
	seen := r.size(path)
	deadline := r.options.Now().Add(r.options.Follow.Limit)

	for tmux.Running(ctx, r.options.Tmux, name) && r.options.Now().Before(deadline) {
		r.options.Follow.Sleep(r.options.Follow.Interval)

		raw, readErr := file.Read(ctx, path)
		if readErr != nil || int64(len(raw)) <= seen {
			continue
		}

		for _, line := range strings.Split(strings.TrimRight(string(raw[seen:]), "\n"), "\n") {
			emit(line)
		}
		seen = int64(len(raw))
	}

	return nil
}

func (r *Reader) size(path string) int64 {
	raw, err := file.Read(r.ctx(), path)
	if err != nil {
		return 0
	}

	return int64(len(raw))
}

// The command is printed before it runs: how a project's dependencies were installed should never be a guess.
func (r *Reader) Install(name string) (string, error) {
	project, known := r.registry().Get(name)
	if !known {
		return "", registry.NotFound(name)
	}

	command := project.InstallCommand()
	if command == "" {
		return "", nil
	}

	ctx := r.ctx()
	dir := project.Path(r.options.Paths.Resolved().Projects)
	if !file.Exists(ctx, dir) {
		return "", protocol.NewError(contract.ErrorProjectNotFound, i18n.T("state.project.dir.missing", name, dir)).
			WithFix(i18n.T("state.project.sync.fix", name))
	}

	ctx.Logf("%s : %s", name, command)

	// The declared line needs a shell to honour its "&&" and its variables; it travels as one argv word, and runs as dev, never as root.
	if _, err := user.RunIn(ctx, r.options.Tmux.User, dir, "zsh", "-lc", command); err != nil {
		return command, protocol.NewError(contract.ErrorInternal, i18n.T("state.project.install.failed", name, command)).
			WithFix(i18n.T("state.project.install.failed.fix"))
	}

	return command, nil
}

func (r *Reader) URL(name string) (string, error) {
	project, known := r.registry().Get(name)
	if !known {
		return "", registry.NotFound(name)
	}

	return url(project), nil
}

// A project only has a public address if the route of its main port carries a name on the web, stored when it was declared; printing "https://…" otherwise would be an address that does not answer.
func url(project registry.Project) string {
	if route, published := project.Primary(); published {
		return "https://" + route.Hostname
	}

	return "http://" + project.Host + ":" + strconv.Itoa(project.Port)
}

func head(ctx sys.Context, root string) string {
	raw, err := file.Read(ctx, root+"/.git/HEAD")
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

// The Gradle property the JVM rows read, and the one the shell stack passed before this binary existed.
const debugFlag = "-PdebugPort="

// A project restarted under its debug agent, on the port the machine declared for it.
//
// That port listens on the loopback alone: it comes back through the SSH
// session like the database, and nothing new opens on the firewall. Which
// project is debuggable is read from the machine rather than guessed from its
// package manager — a gradle row is not necessarily a JVM server, and two of
// them cannot share one port. project.restart puts it back on a normal start;
// there is no second parameter for that.
func (r *Reader) Debug(name string) (contract.ProjectDebug, error) {
	project, known := r.registry().Get(name)
	if !known {
		return contract.ProjectDebug{}, registry.NotFound(name)
	}

	if project.IsService() {
		return contract.ProjectDebug{}, protocol.NewError(contract.ErrorBadRequest, i18n.T("state.debug.service", name)).
			WithFix(i18n.T("state.debug.service.fix"))
	}

	port, declared := r.debugPort(name)
	if !declared {
		return contract.ProjectDebug{}, protocol.NewError(contract.ErrorBadRequest, i18n.T("state.debug.undeclared", name)).
			WithFix(i18n.T("state.debug.undeclared.fix", env.DebugPortsKey, name))
	}

	if err := r.stop(project); err != nil {
		return contract.ProjectDebug{}, err
	}

	if err := r.startWith(project, project.Cmd+" "+debugFlag+strconv.Itoa(port)); err != nil {
		return contract.ProjectDebug{}, err
	}

	current, err := r.one(name)
	if err != nil {
		return contract.ProjectDebug{}, err
	}

	return contract.ProjectDebug{State: current.State, Port: current.Port, DebugPort: port}, nil
}

// PUPITRE_DEBUG_PORTS, in the format the stack has always written: "project:port project:port".
func (r *Reader) debugPort(name string) (int, bool) {
	value, _, err := env.Get(r.ctx(), env.DebugPortsKey)
	if err != nil {
		return 0, false
	}

	// systemd reads this file as an EnvironmentFile, where a value holding
	// spaces has to be quoted to stay one variable; env.Get hands back the line
	// as written, quotes included.
	for _, entry := range strings.Fields(strings.Trim(value, `"'`)) {
		declared, raw, split := strings.Cut(entry, ":")
		if !split || declared != name {
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
