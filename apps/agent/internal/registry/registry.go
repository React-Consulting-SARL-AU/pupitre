package registry

import (
	"path"
	"pupitre.studio/agent/internal/i18n"
	"regexp"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	DefaultConf  = "/etc/pupitre/projects.conf"
	DefaultLocal = "/etc/pupitre/projects.local.conf"
	ProjectsDir  = "/home/dev/projects"

	FirstPort = 3000
	LastPort  = 65535
)

const header = `# Projets ajoutés depuis Pupitre ou par un agent.
# Ce fichier survit aux déploiements : le dépôt n'y touche jamais.
# Colonnes : name|dir|repo|pkgmgr|host|port|sub|cmd|install
`

var (
	namePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]*$`)
	subPattern  = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`)
)

// The nine columns of server/projects.conf, kept verbatim: "-" is a value of the format, not an absence.
type Project struct {
	Name      string
	Dir       string
	Repo      string
	PkgMgr    string
	Host      string
	Port      int
	Subdomain string
	Cmd       string
	Install   string
	Local     bool
}

func (p Project) IsService() bool {
	return p.PkgMgr == "service"
}

// The first segment of dir: several projects often share one repository, and that is where its .git lives.
func (p Project) Root() string {
	root, _, _ := strings.Cut(p.Dir, "/")
	if root == "" || root == "." {
		return p.Name
	}

	return root
}

func (p Project) Path(projects string) string {
	return Under(projects, p.Dir)
}

func (p Project) RootPath(projects string) string {
	return Under(projects, p.Root())
}

func (p Project) Sub() string {
	if p.Subdomain == "-" {
		return ""
	}

	return p.Subdomain
}

// Column 9 when it carries something, the package manager's own command otherwise — and we say which, never guess.
func (p Project) InstallCommand() string {
	if explicit := value(p.Install); explicit != "" {
		return explicit
	}

	switch p.PkgMgr {
	case "bun":
		return "bun install"
	case "pnpm":
		return "pnpm install"
	case "npm":
		return "npm install"
	case "uv":
		return "uv sync"
	case "gradle":
		return "./gradlew --version"
	}

	return ""
}

func (p Project) Row() string {
	columns := []string{p.Name, p.Dir, dash(p.Repo), p.PkgMgr, p.Host, strconv.Itoa(p.Port), dash(p.Subdomain), p.Cmd}
	if install := value(p.Install); install != "" {
		columns = append(columns, install)
	}

	return strings.Join(columns, "|")
}

func (p Project) Contract(projects string) contract.Project {
	return contract.Project{
		Name:      p.Name,
		Dir:       p.Dir,
		Path:      p.Path(projects),
		Repo:      value(p.Repo),
		PkgMgr:    p.PkgMgr,
		Host:      p.Host,
		Port:      p.Port,
		Subdomain: p.Sub(),
		Cmd:       p.Cmd,
		Install:   p.InstallCommand(),
	}
}

// Under: the on-disk registry file is hand-edited, so a row that aims outside the projects root returns no path rather than a path elsewhere.
func Under(root, relative string) string {
	base := path.Clean(root)
	full := path.Clean(base + "/" + relative)

	if full != base && !strings.HasPrefix(full, base+"/") {
		return ""
	}

	return full
}

type Paths struct {
	Conf     string
	Local    string
	Projects string
}

func (p Paths) Resolved() Paths {
	if p.Conf == "" {
		p.Conf = DefaultConf
	}
	if p.Local == "" {
		p.Local = DefaultLocal
	}
	if p.Projects == "" {
		p.Projects = ProjectsDir
	}

	return p
}

type File struct {
	Paths    Paths
	Projects []Project
}

// The repository's file, then the local one: on equal names the local row wins, and the order stays that of the first appearance.
func Load(ctx sys.Context, paths Paths) *File {
	paths = paths.Resolved()
	loaded := &File{Paths: paths}

	index := map[string]int{}
	for _, source := range []struct {
		path  string
		local bool
	}{{paths.Conf, false}, {paths.Local, true}} {
		raw, err := file.Read(ctx, source.path)
		if err != nil {
			continue
		}

		for _, project := range Parse(raw, source.local) {
			if project.Path(paths.Projects) == "" || project.RootPath(paths.Projects) == "" {
				continue
			}

			if at, seen := index[project.Name]; seen {
				loaded.Projects[at] = project
				continue
			}

			index[project.Name] = len(loaded.Projects)
			loaded.Projects = append(loaded.Projects, project)
		}
	}

	return loaded
}

func Parse(raw []byte, local bool) []Project {
	var projects []Project

	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimRight(line, "\r")
		if trimmed := strings.TrimSpace(line); trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		columns := strings.Split(line, "|")
		if len(columns) < 8 {
			continue
		}

		port, err := strconv.Atoi(columns[5][strings.LastIndex(columns[5], ":")+1:])
		if err != nil {
			continue
		}

		project := Project{
			Name:      columns[0],
			Dir:       columns[1],
			Repo:      columns[2],
			PkgMgr:    columns[3],
			Host:      columns[4],
			Port:      port,
			Subdomain: columns[6],
			Cmd:       columns[7],
			Local:     local,
		}
		if len(columns) > 8 {
			project.Install = columns[8]
		}

		projects = append(projects, project)
	}

	return projects
}

func (f *File) Get(name string) (Project, bool) {
	for _, project := range f.Projects {
		if project.Name == name {
			return project, true
		}
	}

	return Project{}, false
}

func (f *File) Ports() map[int]bool {
	ports := map[int]bool{}
	for _, project := range f.Projects {
		ports[project.Port] = true
	}

	return ports
}

func (f *File) FreePort(from int, busy map[int]bool) int {
	taken := f.Ports()

	for port := max(from, FirstPort); port <= LastPort; port++ {
		if !taken[port] && !busy[port] {
			return port
		}
	}

	return 0
}

func (f *File) Add(ctx sys.Context, project Project) error {
	if err := f.validate(project); err != nil {
		return err
	}

	rows := f.localRows()
	rows = append(rows, project.Row())

	if err := f.write(ctx, rows); err != nil {
		return err
	}

	project.Local = true
	f.Projects = append(f.Projects, project)

	return nil
}

func (f *File) Remove(ctx sys.Context, name string) (Project, error) {
	project, known := f.Get(name)
	if !known {
		return Project{}, NotFound(name)
	}

	if !project.Local {
		return Project{}, protocol.NewError(contract.ErrorBadRequest, i18n.T("registry.project.versioned", name)).
			WithFix(i18n.T("registry.project.versioned.fix"))
	}

	var kept []string
	for _, row := range f.localRows() {
		if rowName(row) != name {
			kept = append(kept, row)
		}
	}

	if err := f.write(ctx, kept); err != nil {
		return Project{}, err
	}

	return project, nil
}

func (f *File) localRows() []string {
	var rows []string
	for _, project := range f.Projects {
		if project.Local {
			rows = append(rows, project.Row())
		}
	}

	return rows
}

func (f *File) write(ctx sys.Context, rows []string) error {
	content := header
	if len(rows) > 0 {
		content += "\n" + strings.Join(rows, "\n") + "\n"
	}

	return file.WriteAtomic(ctx, f.Paths.Resolved().Local, []byte(content), 0o600)
}

func (f *File) validate(project Project) error {
	if !namePattern.MatchString(project.Name) {
		return bad(i18n.T("registry.name.invalid", project.Name), i18n.T("registry.name.invalid.fix"))
	}

	if project.Dir == "" || strings.HasPrefix(project.Dir, "/") || strings.Contains(project.Dir, "..") {
		return bad(i18n.T("registry.dir.invalid", project.Dir), i18n.T("registry.dir.invalid.fix", f.Paths.Resolved().Projects))
	}

	if project.Port < 1024 || project.Port > LastPort {
		return bad(i18n.T("registry.port.invalid", project.Port), i18n.T("registry.port.invalid.fix", LastPort, f.FreePort(FirstPort, nil)))
	}

	if !known(project.PkgMgr) {
		return bad(i18n.T("registry.pkgmgr.unknown", project.PkgMgr), i18n.T("registry.pkgmgr.unknown.fix", strings.Join(contract.PackageManagers, ", ")))
	}

	if project.Cmd == "" {
		return bad(i18n.T("registry.cmd.empty"), i18n.T("registry.cmd.empty.fix"))
	}

	if sub := project.Sub(); sub != "" && !subPattern.MatchString(sub) {
		return bad(i18n.T("registry.sub.invalid", sub), i18n.T("registry.sub.invalid.fix"))
	}

	if err := f.checkSeparators(project); err != nil {
		return err
	}

	return f.checkUnique(project)
}

// A "|" or a newline in a field would split the row in two and turn a project into another one.
func (f *File) checkSeparators(project Project) error {
	for key, field := range map[string]string{
		"registry.field.name": project.Name, "registry.field.dir": project.Dir,
		"registry.field.repo": project.Repo, "registry.field.host": project.Host,
		"registry.field.sub": project.Subdomain, "registry.field.cmd": project.Cmd,
		"registry.field.install": project.Install,
	} {
		if strings.ContainsAny(field, "|\n\r") {
			return bad(i18n.T("registry.field.separator", i18n.T(key)), i18n.T("registry.field.separator.fix"))
		}
	}

	return nil
}

func (f *File) checkUnique(project Project) error {
	for _, existing := range f.Projects {
		switch {
		case existing.Name == project.Name:
			return bad(i18n.T("registry.project.declared", project.Name), i18n.T("registry.project.declared.fix"))
		case existing.Port == project.Port:
			return f.portTaken(project, existing)
		case project.Sub() != "" && existing.Sub() == project.Sub():
			return bad(i18n.T("registry.sub.taken", project.Sub(), existing.Name), i18n.T("registry.sub.taken.fix"))
		}
	}

	return nil
}

// The free port travels twice: in the sentence a human reads, and in the remedy the app applies without parsing it.
func (f *File) portTaken(project, existing Project) error {
	free := f.FreePort(project.Port, nil)

	failure := protocol.NewError(contract.ErrorBadRequest, i18n.T("registry.port.taken", project.Port, existing.Name)).
		WithFix(i18n.T("registry.port.taken.fix", project.Name, free))

	if free == 0 {
		return failure
	}

	return failure.WithRemedy(contract.PortTaken(free))
}

func NotFound(name string) error {
	return protocol.NewError(contract.ErrorProjectNotFound, i18n.T("registry.project.unknown", name)).
		WithFix(i18n.T("registry.project.unknown.fix"))
}

func bad(message, fix string) error {
	return protocol.NewError(contract.ErrorBadRequest, message).WithFix(fix)
}

func known(pkgmgr string) bool {
	for _, candidate := range contract.PackageManagers {
		if candidate == pkgmgr {
			return true
		}
	}

	return false
}

func rowName(row string) string {
	name, _, _ := strings.Cut(row, "|")

	return name
}

func value(field string) string {
	if field == "-" {
		return ""
	}

	return strings.TrimSpace(field)
}

func dash(field string) string {
	if strings.TrimSpace(field) == "" {
		return "-"
	}

	return field
}
