package state

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/tmux"
)

// The machine, the services and the projects in one round trip: two calls a second over SSH would cost twice one, for the same information.
func (r *Reader) Snapshot() contract.Snapshot {
	return contract.Snapshot{
		Machine:     Machine(r.ctx(), r.options.AgentVersion),
		Services:    r.services(false),
		Projects:    r.projects(),
		Sessions:    []contract.Session{},
		Entitlement: r.entitlement(),
	}
}

func (r *Reader) Status() contract.Status {
	return contract.Status{Services: r.services(false), Projects: r.projects()}
}

func (r *Reader) ServiceStatus(id string) (contract.ServiceStatus, error) {
	module, known := r.module(id)
	if !known {
		return contract.ServiceStatus{}, protocol.NewError(contract.ErrorServiceNotFound, "service inconnu : "+id).
			WithFix("Appelle catalog pour la liste des modules de ce serveur.")
	}

	status, err := module.Status(r.moduleContext(module))
	if err != nil {
		return contract.ServiceStatus{}, err
	}

	if !status.Installed {
		return contract.ServiceStatus{}, modules.NotInstalled(id, module.Manifest().Name)
	}

	return status.Service(module.Manifest()), nil
}

func (r *Reader) module(id string) (modules.Module, bool) {
	if r.options.Registry == nil {
		return nil, false
	}

	return r.options.Registry.Get(id)
}

func (r *Reader) moduleContext(module modules.Module) *modules.Context {
	return modules.NewContext(modules.ContextOptions{
		Sys:      r.options.Sys,
		Now:      r.options.Now,
		Manifest: module.Manifest(),
	})
}

// Credentials name the keys of /etc/pupitre/env, never their values, and even those belong to service.status alone.
func (r *Reader) services(withCredentials bool) []contract.ServiceStatus {
	services := []contract.ServiceStatus{}
	if r.options.Registry == nil {
		return services
	}

	for _, module := range r.options.Registry.All() {
		status, err := module.Status(r.moduleContext(module))
		if err != nil || !status.Installed {
			continue
		}

		service := status.Service(module.Manifest())
		if !withCredentials {
			service.Credentials = nil
		}

		services = append(services, service)
	}

	return services
}

func (r *Reader) projects() []contract.Project {
	ctx := r.ctx()
	file := r.registry()
	collected := tmux.Collect(ctx, r.options.Tmux)
	domain := r.domain()
	branches := map[string]string{}

	projects := make([]contract.Project, 0, len(file.Projects))
	for _, declared := range file.Projects {
		project := declared.Contract()
		project.State = tmux.State(ctx, r.options.Tmux, project, collected)
		project.URL = url(declared, domain)
		project.Branch = r.branch(branches, declared)
		project.PID = collected.PID(declared.Name)
		project.UptimeS = collected.Seconds(declared.Name)

		projects = append(projects, project)
	}

	return projects
}

// Read from .git/HEAD rather than by launching git: git takes ten milliseconds just to start, and several projects share one repository.
func (r *Reader) branch(cache map[string]string, project registry.Project) string {
	root := project.RootPath(r.options.Paths.Resolved().Projects)
	if branch, read := cache[root]; read {
		return branch
	}

	cache[root] = head(r.ctx(), root)

	return cache[root]
}
