package state

import (
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
	"pupitre.studio/agent/internal/tmux"
)

const All = "all"

func (r *Reader) List() []contract.Project {
	return r.projects()
}

func (r *Reader) Add(project registry.Project) (contract.Project, error) {
	ctx := r.ctx()
	file := r.registry()

	if project.Host == "" {
		project.Host = "127.0.0.1"
	}

	if err := file.Add(ctx, project); err != nil {
		return contract.Project{}, err
	}

	paths := r.options.Paths.Resolved()
	for _, dir := range []string{project.RootPath(paths.Projects), project.Path(paths.Projects)} {
		if err := ctx.Sys().MkdirAll(dir, 0o755); err != nil {
			return contract.Project{}, err
		}
	}

	return r.one(project.Name)
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

	return removed.Contract(), nil
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
	ctx := r.ctx()
	if tmux.Running(ctx, r.options.Tmux, project.Name) {
		return nil
	}

	dir := project.Path(r.options.Paths.Resolved().Projects)
	if !file.Exists(ctx, dir) {
		return protocol.NewError(contract.ErrorProjectNotFound, project.Name+" : le dossier "+dir+" est absent").
			WithFix("Récupère les sources avec project.sync " + project.Name + ".")
	}

	return tmux.Start(ctx, r.options.Tmux, tmux.Job{Project: project.Name, Dir: dir, Cmd: project.Cmd})
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
		return "", protocol.NewError(contract.ErrorProjectNotFound, name+" : le dossier "+dir+" est absent").
			WithFix("Récupère les sources avec project.sync " + name + ".")
	}

	ctx.Logf("%s : %s", name, command)

	// The declared line needs a shell to honour its "&&" and its variables; it travels as one argv word, and runs as dev, never as root.
	if _, err := user.RunIn(ctx, r.options.Tmux.User, dir, "zsh", "-lc", command); err != nil {
		return command, protocol.NewError(contract.ErrorInternal, name+" : "+command+" a échoué").
			WithFix("Ouvre le journal du projet, ou corrige la colonne install du registre.")
	}

	return command, nil
}

func (r *Reader) URL(name string) (string, error) {
	project, known := r.registry().Get(name)
	if !known {
		return "", registry.NotFound(name)
	}

	return url(project, r.domain()), nil
}

// A project only has a public address if the machine has a domain and the row gives it a subdomain; printing "https://…" otherwise would be an address that does not answer.
func url(project registry.Project, domain string) string {
	if sub := project.Sub(); sub != "" && domain != "" {
		return "https://" + sub + "." + domain
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
