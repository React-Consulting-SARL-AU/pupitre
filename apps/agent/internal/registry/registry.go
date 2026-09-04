package registry

import (
	"fmt"
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
	return projects + "/" + p.Dir
}

func (p Project) RootPath(projects string) string {
	return projects + "/" + p.Root()
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

func (p Project) Contract() contract.Project {
	return contract.Project{
		Name:      p.Name,
		Dir:       p.Dir,
		Repo:      value(p.Repo),
		PkgMgr:    p.PkgMgr,
		Host:      p.Host,
		Port:      p.Port,
		Subdomain: p.Sub(),
		Cmd:       p.Cmd,
		Install:   p.InstallCommand(),
	}
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
		return Project{}, protocol.NewError(contract.ErrorBadRequest, name+" vient du registre du dépôt, pas de ce serveur").
			WithFix("Retire sa ligne de projects.conf dans le dépôt, puis redéploie.")
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
		return bad("nom de projet invalide : "+project.Name, "Minuscules, chiffres, point, tiret et souligné, en commençant par une lettre ou un chiffre.")
	}

	if project.Dir == "" || strings.HasPrefix(project.Dir, "/") || strings.Contains(project.Dir, "..") {
		return bad("dossier invalide : "+project.Dir, "Donne un chemin relatif à "+f.Paths.Resolved().Projects+", sans « .. ».")
	}

	if project.Port < 1024 || project.Port > LastPort {
		return bad(fmt.Sprintf("port invalide : %d", project.Port), fmt.Sprintf("Choisis un port entre 1024 et %d, par exemple %d.", LastPort, f.FreePort(FirstPort, nil)))
	}

	if !known(project.PkgMgr) {
		return bad("gestionnaire de paquets inconnu : "+project.PkgMgr, "Choisis "+strings.Join(contract.PackageManagers, ", ")+".")
	}

	if project.Cmd == "" {
		return bad("commande de démarrage vide", "Donne la commande qui lance le projet, par exemple « bun run dev --port 3000 ».")
	}

	if sub := project.Sub(); sub != "" && !subPattern.MatchString(sub) {
		return bad("sous-domaine invalide : "+sub, "Un seul niveau, minuscules, chiffres et tirets — c'est ce que couvre le certificat joker.")
	}

	if err := f.checkSeparators(project); err != nil {
		return err
	}

	return f.checkUnique(project)
}

// A "|" or a newline in a field would split the row in two and turn a project into another one.
func (f *File) checkSeparators(project Project) error {
	for label, field := range map[string]string{
		"nom": project.Name, "dossier": project.Dir, "dépôt": project.Repo, "hôte": project.Host,
		"sous-domaine": project.Subdomain, "commande": project.Cmd, "installation": project.Install,
	} {
		if strings.ContainsAny(field, "|\n\r") {
			return bad(label+" : le caractère « | » et les retours à la ligne sont interdits", "Retire-les : « | » sépare les colonnes du registre.")
		}
	}

	return nil
}

func (f *File) checkUnique(project Project) error {
	for _, existing := range f.Projects {
		switch {
		case existing.Name == project.Name:
			return bad(project.Name+" est déjà déclaré", "Retire-le avec project.remove, ou choisis un autre nom.")
		case existing.Port == project.Port:
			return bad(fmt.Sprintf("le port %d est déjà pris par %s", project.Port, existing.Name),
				fmt.Sprintf("Donne un autre port à %s, par exemple %d.", project.Name, f.FreePort(project.Port, nil)))
		case project.Sub() != "" && existing.Sub() == project.Sub():
			return bad("le sous-domaine "+project.Sub()+" est déjà pris par "+existing.Name, "Choisis un autre sous-domaine.")
		}
	}

	return nil
}

func NotFound(name string) error {
	return protocol.NewError(contract.ErrorProjectNotFound, "projet inconnu : "+name).
		WithFix("Appelle project.list pour la liste des projets déclarés.")
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
