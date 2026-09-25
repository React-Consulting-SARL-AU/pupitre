package state

import (
	"slices"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/tmux"
)

func (r *Reader) Snapshot() contract.Snapshot {
	table := r.processes()
	collected := r.collect()

	return contract.Snapshot{
		Machine:     Machine(r.ctx(), r.options.AgentVersion),
		Services:    r.services(false),
		Projects:    r.list(collected, table),
		Sessions:    r.sessions(table, collected.Panes()),
		Entitlement: r.entitlement(),
	}
}

func (r *Reader) Status() contract.Status {
	return contract.Status{Services: r.services(false), Projects: r.projects()}
}

func (r *Reader) ServiceStatus(id string) (contract.ServiceStatus, error) {
	module, known := r.module(id)
	if !known {
		return contract.ServiceStatus{}, protocol.NewError(contract.ErrorServiceNotFound, i18n.T("state.service.unknown", id)).
			WithFix(i18n.T("state.service.unknown.fix"))
	}

	status, err := module.Status(r.moduleContext(module))
	if err != nil {
		return contract.ServiceStatus{}, err
	}

	if !status.Installed {
		return contract.ServiceStatus{}, modules.NotInstalled(id, module.Manifest().Name)
	}

	service := status.Service(module.Manifest())
	service.Configured = !slices.Contains(r.deferred(), id)

	// The CLI sign-in check costs a round trip: worth it for one module, never in a snapshot.
	if account, signs := module.(modules.Account); signs {
		if login, asked := account.Login(r.moduleContext(module)); asked {
			service.Login = &login
		}
	}

	return service, nil
}

func (r *Reader) module(id string) (modules.Module, bool) {
	if r.options.Registry == nil {
		return nil, false
	}

	return r.options.Registry.Get(id)
}

func (r *Reader) moduleContext(module modules.Module) *modules.Context {
	installPath := r.options.InstallPath
	if installPath == "" {
		installPath = modules.DefaultInstallPath
	}

	return modules.NewContext(modules.ContextOptions{
		Sys:         r.options.Sys,
		Now:         r.options.Now,
		Manifest:    module.Manifest(),
		InstallPath: installPath,
	})
}

// Configured comes from the deferred list, not the module: upgrade drift would read as questions nobody answered.
func (r *Reader) services(withCredentials bool) []contract.ServiceStatus {
	services := []contract.ServiceStatus{}
	if r.options.Registry == nil {
		return services
	}

	deferred := r.deferred()

	for _, module := range r.options.Registry.All() {
		status, err := module.Status(r.moduleContext(module))
		if err != nil || !status.Installed {
			continue
		}

		service := status.Service(module.Manifest())
		service.Configured = !slices.Contains(deferred, service.ID)
		if !withCredentials {
			service.Credentials = nil
		}

		services = append(services, service)
	}

	return services
}

func (r *Reader) collect() tmux.Collection {
	return tmux.Collect(r.ctx(), r.options.Tmux)
}

func (r *Reader) projects() []contract.Project {
	return r.list(r.collect(), r.processes())
}

func (r *Reader) list(collected tmux.Collection, table processTable) []contract.Project {
	ctx := r.ctx()
	file := r.registry()
	memory := table.ram(collected.Panes())
	branches := map[string]string{}

	projects := make([]contract.Project, 0, len(file.Projects))

	for _, declared := range file.Projects {
		project := declared.Contract(r.options.Paths.Resolved().Projects)

		for at, process := range declared.Processes {
			window := declared.Window(process.ID)
			project.Processes[at].State = tmux.State(ctx, r.options.Tmux, window, process.PkgMgr, process.Port, collected)
			project.Processes[at].URL = processURL(process)
			project.Processes[at].PID = collected.PID(window)
			project.Processes[at].RAMMB = memory[window]
			project.Processes[at].UptimeS = collected.Seconds(window)
		}

		project.State = aggregate(project.Processes)
		project.URL = url(declared)

		// The registry's branch stands until there is a working tree to read HEAD from.
		if head := r.branch(branches, declared); head != "" {
			project.Branch = head
		}

		projects = append(projects, project)
	}

	return projects
}

func aggregate(processes []contract.ProjectProcess) contract.ProjectState {
	counted := map[contract.ProcessState]int{}
	ours := 0

	for _, process := range processes {
		counted[process.State]++
		if process.State != contract.ProcessService && process.State != contract.ProcessDown {
			ours++
		}
	}

	switch {
	case counted[contract.ProcessFailed] > 0:
		return contract.ProjectFailed
	case counted[contract.ProcessStarting] > 0:
		return contract.ProjectStarting
	case ours == 0 && counted[contract.ProcessService] > 0:
		return contract.ProjectService
	case ours == 0:
		return contract.ProjectDown
	}

	up := counted[contract.ProcessOnline] + counted[contract.ProcessExternal]

	switch {
	case up == ours && counted[contract.ProcessExternal] == ours:
		return contract.ProjectExternal
	case up == ours:
		return contract.ProjectOnline
	case up > 0:
		return contract.ProjectPartial
	}

	return contract.ProjectStopped
}

// Reads .git/HEAD instead of spawning git, which takes ten milliseconds just to start.
func (r *Reader) branch(cache map[string]string, project registry.Project) string {
	projects := r.options.Paths.Resolved().Projects

	root := project.RootPath(projects)
	if root == "" {
		return ""
	}

	if branch, read := cache[root]; read {
		return branch
	}

	cache[root] = head(r.ctx(), projects, below(projects, root))

	return cache[root]
}
