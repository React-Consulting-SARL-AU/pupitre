package registry

import (
	"encoding/json"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/net"
)

const (
	DefaultConf  = "/etc/pupitre/projects.conf"
	DefaultLocal = "/etc/pupitre/projects.local.json"
	ProjectsDir  = "/home/dev/projects"

	// The windows that were up, kept for the boot that follows: state of the machine, not configuration, so it lives with the report.
	DefaultRunning = "/var/lib/pupitre/projects.running.json"

	FirstPort = 3000
	LastPort  = 65535
)

// A subdomain is a DNS name under the server's domain: one label, or several separated by dots when the client's own certificate covers them.
const (
	subLabel = `[a-z0-9](?:[a-z0-9-]*[a-z0-9])?`

	SubdomainMax = 190
	HostnameMax  = 253
	LabelMax     = 63

	// Loopback is the host a project has unless its repository freezes a .localhost name.
	Loopback = "127.0.0.1"
)

var (
	namePattern  = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]*$`)
	subPattern   = regexp.MustCompile(`^` + subLabel + `(?:\.` + subLabel + `)*$`)
	labelPattern = regexp.MustCompile(`^` + subLabel + `$`)
	hostPattern  = regexp.MustCompile(`^` + subLabel + `(?:\.` + subLabel + `)+$`)

	// BranchPattern is what git will take on a clone or a checkout, and the app refuses the rest before asking.
	BranchPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$`)

	// LocalhostPattern is a name under .localhost: the one kind of host, besides the loopback, the agent makes the machine answer to.
	LocalhostPattern = regexp.MustCompile(`^(?:` + subLabel + `\.)+localhost$`)

	notLabel = regexp.MustCompile(`[^a-z0-9-]+`)
	dashes   = regexp.MustCompile(`-{2,}`)
)

// LabelFrom folds a project name into the one DNS label a route's label has to be: my.site becomes my-site.
func LabelFrom(name string) string {
	label := strings.Trim(dashes.ReplaceAllString(notLabel.ReplaceAllString(strings.ToLower(name), "-"), "-"), "-")
	if label == "" {
		return "web"
	}

	return label
}

// A Route is one port a project listens on, and the whole name it answers to on the web when it has one.
//
// The hostname is stored as resolved: a name on the web does not move because the
// server's domain did, and nothing here ever puts a subdomain and a domain back together.
type Route struct {
	Label    string `json:"label"`
	Port     int    `json:"port"`
	Hostname string `json:"hostname,omitempty"`
}

// RootDir is the folder a process runs from when it runs from its project's own.
const RootDir = "."

// A Process is what runs in a project: one command, from one folder of it, on one main port, in one tmux window.
type Process struct {
	ID      string  `json:"id"`
	Dir     string  `json:"dir"`
	PkgMgr  string  `json:"pkgmgr"`
	Host    string  `json:"host"`
	Port    int     `json:"port"`
	Routes  []Route `json:"routes"`
	Cmd     string  `json:"cmd"`
	Install string  `json:"install,omitempty"`
}

// A Project is a repository, or a folder, and the processes that run in it — one at the least.
type Project struct {
	Name      string    `json:"name"`
	Dir       string    `json:"dir"`
	Repo      string    `json:"repo,omitempty"`
	Branch    string    `json:"branch,omitempty"`
	Processes []Process `json:"processes"`
	// Boot says the project starts with the server, whatever ran when it went down.
	Boot bool `json:"boot"`
	// Runtimes is the version each runtime runs at in this project, by mise tool; a tool absent runs at the machine's default.
	Runtimes map[string]string `json:"runtimes"`
	Local    bool              `json:"-"`
}

func (p Process) IsService() bool {
	return p.PkgMgr == "service"
}

// Primary is the route of the main port that carries a name on the web, and it is where the process's address comes from.
func (p Process) Primary() (Route, bool) {
	for _, route := range p.Routes {
		if route.Port == p.Port && route.Hostname != "" {
			return route, true
		}
	}

	return Route{}, false
}

func (p Process) Hostnames() []string {
	var names []string
	for _, route := range p.Routes {
		if route.Hostname != "" {
			names = append(names, route.Hostname)
		}
	}

	return names
}

// Ports is every port the process holds on the machine: the main one, and the ones its routes name.
func (p Process) Ports() []int {
	ports := []int{p.Port}
	for _, route := range p.Routes {
		if route.Port != p.Port {
			ports = append(ports, route.Port)
		}
	}

	return ports
}

// The install column when it carries something, the package manager's own command otherwise — and we say which, never guess.
func (p Process) InstallCommand() string {
	if explicit := value(p.Install); explicit != "" {
		return explicit
	}

	return InstallCommandOf(p.PkgMgr)
}

func InstallCommandOf(pkgmgr string) string {
	switch pkgmgr {
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

// Path is the folder the process runs from, under its project's.
func (p Process) Path(projectPath string) string {
	if p.Dir == "" || p.Dir == RootDir {
		return projectPath
	}

	return Under(projectPath, p.Dir)
}

// Window is the tmux window the process runs in, and the log it writes: neither a project name nor a process id admits a slash.
func Window(project, process string) string {
	return project + "/" + process
}

// SplitWindow reads a window name back into its project and its process; a window that is not one of ours answers nothing.
func SplitWindow(window string) (string, string, bool) {
	project, process, found := strings.Cut(window, "/")
	if !found || project == "" || process == "" {
		return "", "", false
	}

	return project, process, true
}

func (p Project) Window(process string) string {
	return Window(p.Name, process)
}

// A project is a service when every process of it is systemd's: it shows in the state, and "all" never starts or stops it.
func (p Project) IsService() bool {
	for _, process := range p.Processes {
		if !process.IsService() {
			return false
		}
	}

	return len(p.Processes) > 0
}

func (p Project) Process(id string) (Process, bool) {
	for _, process := range p.Processes {
		if process.ID == id {
			return process, true
		}
	}

	return Process{}, false
}

func (p Project) Path(projects string) string {
	return Under(projects, p.Dir)
}

// RootPath is where the repository lives: the project's own folder, since a project is a repository.
func (p Project) RootPath(projects string) string {
	return p.Path(projects)
}

// Primary is the first process whose main port carries a name on the web: the project's address is that process's.
func (p Project) Primary() (Process, Route, bool) {
	for _, process := range p.Processes {
		if route, published := process.Primary(); published {
			return process, route, true
		}
	}

	return Process{}, Route{}, false
}

func (p Project) Hostnames() []string {
	var names []string
	for _, process := range p.Processes {
		names = append(names, process.Hostnames()...)
	}

	return names
}

func (p Project) Ports() []int {
	var ports []int
	for _, process := range p.Processes {
		ports = append(ports, process.Ports()...)
	}

	return ports
}

func (p Project) Hosts() []string {
	var hosts []string
	for _, process := range p.Processes {
		hosts = append(hosts, process.Host)
	}

	return hosts
}

func (p Process) Contract(projectPath string) contract.ProjectProcess {
	routes := make([]contract.Route, 0, len(p.Routes))
	for _, route := range p.Routes {
		routes = append(routes, contract.Route{Label: route.Label, Port: route.Port, Hostname: route.Hostname})
	}

	return contract.ProjectProcess{
		ID:      p.ID,
		Dir:     p.Dir,
		Path:    p.Path(projectPath),
		PkgMgr:  p.PkgMgr,
		Host:    p.Host,
		Port:    p.Port,
		Routes:  routes,
		Cmd:     p.Cmd,
		Install: p.InstallCommand(),
	}
}

func (p Project) Contract(projects string) contract.Project {
	path := p.Path(projects)

	processes := make([]contract.ProjectProcess, 0, len(p.Processes))
	for _, process := range p.Processes {
		processes = append(processes, process.Contract(path))
	}

	runtimes := p.Runtimes
	if runtimes == nil {
		runtimes = map[string]string{}
	}

	return contract.Project{
		Name:      p.Name,
		Dir:       p.Dir,
		Path:      path,
		Repo:      value(p.Repo),
		Branch:    value(p.Branch),
		Processes: processes,
		Boot:      p.Boot,
		Runtimes:  runtimes,
	}
}

// The first segment of a legacy row's dir: the repository folder, which the following segments point into.
func rootOf(dir string) (string, string) {
	root, rest, _ := strings.Cut(dir, "/")
	if root == "" || root == RootDir {
		return RootDir, RootDir
	}

	if rest == "" {
		rest = RootDir
	}

	return root, rest
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
	Running  string
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
	if p.Running == "" {
		p.Running = DefaultRunning
	}

	return p
}

type File struct {
	Paths    Paths
	Projects []Project
	// Domain is what the machine publishes under, read once with the registry: a route is resolved and refused against it.
	Domain string
}

// The repository's file, then the local one: on equal names the local row wins, and the order stays that of the first appearance.
func Load(ctx sys.Context, paths Paths) *File {
	paths = paths.Resolved()
	loaded := &File{Paths: paths, Domain: domainOf(ctx)}

	index := map[string]int{}
	for _, source := range []struct {
		path  string
		local bool
	}{{paths.Conf, false}, {paths.Local, true}} {
		raw, err := file.Read(ctx, source.path)
		if err != nil {
			continue
		}

		var projects []Project
		if source.local {
			projects, _ = ParseLocal(raw)
		} else {
			projects = ParseConf(raw, loaded.Domain)
		}

		for _, project := range projects {
			if !namePattern.MatchString(project.Name) || project.Path(paths.Projects) == "" || len(project.Processes) == 0 || !contained(project, paths.Projects) {
				continue
			}

			project.Local = source.local
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

func domainOf(ctx sys.Context) string {
	domain, _, err := env.Get(ctx, env.DomainKey)
	if err != nil {
		return ""
	}

	return domain
}

// A Row is one line of the repository's own file, or one entry of the local file as the agent wrote it before processes existed: one command, one port, one folder.
type Row struct {
	Name    string  `json:"name"`
	Dir     string  `json:"dir"`
	Repo    string  `json:"repo,omitempty"`
	PkgMgr  string  `json:"pkgmgr"`
	Host    string  `json:"host"`
	Port    int     `json:"port"`
	Routes  []Route `json:"routes"`
	Cmd     string  `json:"cmd"`
	Install string  `json:"install,omitempty"`
	Branch  string  `json:"branch,omitempty"`
}

// ParseConf reads the repository's own file, whose seventh column is a subdomain by its own specification: it becomes the one route of the row, under the domain the machine has today.
func ParseConf(raw []byte, domain string) []Project {
	var rows []Row

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

		row := Row{
			Name:   columns[0],
			Dir:    columns[1],
			Repo:   columns[2],
			PkgMgr: columns[3],
			Host:   columns[4],
			Port:   port,
			Routes: []Route{},
			Cmd:    columns[7],
		}
		if sub := value(columns[6]); sub != "" {
			row.Routes = append(row.Routes, Route{Label: LabelFrom(row.Name), Port: port, Hostname: compose(sub, domain)})
		}
		if len(columns) > 8 {
			row.Install = columns[8]
		}
		if len(columns) > 9 {
			row.Branch = value(columns[9])
		}

		rows = append(rows, row)
	}

	projects, _ := Group(rows)

	return projects
}

// Group turns rows into projects: the rows that share the first segment of their dir share one repository, and that is what the old format meant by it. The second value says which window each row became, by the row's name.
//
// The project is named by the row that sits at the root of the repository; without one, by the folder itself when it makes a valid name nobody else holds, and by the first row otherwise. A row alone keeps its name: nothing is renamed that did not have to be.
func Group(rows []Row) ([]Project, map[string]string) {
	var order []string
	byRoot := map[string][]Row{}
	shared := map[string]bool{}
	for _, row := range rows {
		root, _ := rootOf(row.Dir)
		// A folder that leaves the root is nobody's repository: the row stays alone, and Load drops it.
		key := root
		if root == RootDir || !validDir(row.Dir) {
			key = row.Name
		}

		if _, seen := byRoot[key]; !seen {
			order = append(order, key)
			shared[key] = key == root
		}
		byRoot[key] = append(byRoot[key], row)
	}

	windows := map[string]string{}
	var projects []Project
	for _, key := range order {
		group := byRoot[key]
		project := Project{Dir: group[0].Dir, Name: group[0].Name}
		if shared[key] {
			project.Dir = key
			project.Name = nameFor(key, group, rows)
		}

		ids := map[string]bool{}
		for _, row := range group {
			if project.Repo == "" {
				project.Repo = value(row.Repo)
			}
			if project.Branch == "" {
				project.Branch = value(row.Branch)
			}

			rest := RootDir
			if shared[key] {
				_, rest = rootOf(row.Dir)
			}
			id := uniqueID(LabelFrom(row.Name), ids)
			windows[row.Name] = Window(project.Name, id)

			project.Processes = append(project.Processes, Process{
				ID:      id,
				Dir:     rest,
				PkgMgr:  row.PkgMgr,
				Host:    row.Host,
				Port:    row.Port,
				Routes:  append([]Route{}, row.Routes...),
				Cmd:     row.Cmd,
				Install: value(row.Install),
			})
		}

		projects = append(projects, project)
	}

	return projects, windows
}

// The folder of the repository names the project, unless a row of another repository already holds that name; then the row at the root of the repository, then the first row.
func nameFor(root string, group []Row, rows []Row) string {
	if len(group) == 1 {
		return group[0].Name
	}

	if namePattern.MatchString(root) && !heldOutside(root, group, rows) {
		return root
	}

	for _, row := range group {
		if _, rest := rootOf(row.Dir); rest == RootDir {
			return row.Name
		}
	}

	return group[0].Name
}

func heldOutside(name string, group []Row, rows []Row) bool {
	inside := map[string]bool{}
	for _, row := range group {
		inside[row.Name] = true
	}

	for _, row := range rows {
		if row.Name == name && !inside[name] {
			return true
		}
	}

	return false
}

func uniqueID(label string, ids map[string]bool) string {
	candidate := label
	for rank := 2; ids[candidate]; rank++ {
		candidate = label + "-" + strconv.Itoa(rank)
	}
	ids[candidate] = true

	return candidate
}

type document struct {
	Projects []Project `json:"projects"`
}

// ParseLocal reads the file this agent writes: one JSON document, one shape.
func ParseLocal(raw []byte) ([]Project, error) {
	var parsed document
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, err
	}

	for _, project := range parsed.Projects {
		for at := range project.Processes {
			if project.Processes[at].Routes == nil {
				project.Processes[at].Routes = []Route{}
			}
			if project.Processes[at].Dir == "" {
				project.Processes[at].Dir = RootDir
			}
		}
	}

	return parsed.Projects, nil
}

func compose(sub, domain string) string {
	if domain == "" {
		return ""
	}

	return sub + "." + domain
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
		for _, port := range project.Ports() {
			ports[port] = true
		}
	}

	return ports
}

// FreePort is the first port nobody declared and nothing listens on: busy is what the machine's sockets say, and the registry only knows its own rows.
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
	project = cleaned(project)

	if err := f.validate(ctx, project, ""); err != nil {
		return err
	}

	project.Local = true
	rows := append(f.locals(), project)

	if err := f.write(ctx, rows); err != nil {
		return err
	}

	f.Projects = append(f.Projects, project)

	return nil
}

// A Patch is what project.update may change; a nil field is a field left as it was, and a list of processes replaces the whole of the last one.
type Patch struct {
	Branch    *string
	Boot      *bool
	Runtimes  *map[string]string
	Processes *[]Process
}

// Update rewrites one local row, and nothing else: the repository's rows belong to the repository.
func (f *File) Update(ctx sys.Context, name string, patch Patch) (Project, error) {
	current, known := f.Get(name)
	if !known {
		return Project{}, NotFound(name)
	}

	if !current.Local {
		return Project{}, versioned(name)
	}

	updated := current
	if patch.Branch != nil {
		updated.Branch = *patch.Branch
	}
	if patch.Boot != nil {
		updated.Boot = *patch.Boot
	}
	if patch.Runtimes != nil {
		updated.Runtimes = *patch.Runtimes
	}
	if patch.Processes != nil {
		updated.Processes = append([]Process{}, (*patch.Processes)...)
	}
	updated = cleaned(updated)

	if err := f.validate(ctx, updated, name); err != nil {
		return Project{}, err
	}

	var rows []Project
	for _, project := range f.locals() {
		if project.Name == name {
			rows = append(rows, updated)
			continue
		}

		rows = append(rows, project)
	}

	if err := f.write(ctx, rows); err != nil {
		return Project{}, err
	}

	for at, project := range f.Projects {
		if project.Name == name {
			f.Projects[at] = updated
		}
	}

	return updated, nil
}

// Rehost moves every route named under `from` to `to`, and answers the names that moved, sorted: the rows of the repository follow the domain on their own, the local rows are rewritten here.
func (f *File) Rehost(ctx sys.Context, from, to string) ([]string, error) {
	moved := []string{}
	if from == "" || from == to {
		return moved, nil
	}

	var rows []Project
	for _, project := range f.locals() {
		for _, process := range project.Processes {
			for at, route := range process.Routes {
				if !strings.HasSuffix(route.Hostname, "."+from) {
					continue
				}

				moved = append(moved, route.Hostname)
				process.Routes[at].Hostname = strings.TrimSuffix(route.Hostname, from) + to
			}
		}

		rows = append(rows, project)
	}

	if len(moved) > 0 {
		if err := f.write(ctx, rows); err != nil {
			return nil, err
		}
	}

	sort.Strings(moved)
	f.Domain = to

	return moved, nil
}

func (f *File) Remove(ctx sys.Context, name string) (Project, error) {
	project, known := f.Get(name)
	if !known {
		return Project{}, NotFound(name)
	}

	if !project.Local {
		return Project{}, versioned(name)
	}

	var kept []Project
	for _, row := range f.locals() {
		if row.Name != name {
			kept = append(kept, row)
		}
	}

	if err := f.write(ctx, kept); err != nil {
		return Project{}, err
	}

	return project, nil
}

func (f *File) locals() []Project {
	var rows []Project
	for _, project := range f.Projects {
		if project.Local {
			rows = append(rows, project)
		}
	}

	return rows
}

func (f *File) write(ctx sys.Context, rows []Project) error {
	if rows == nil {
		rows = []Project{}
	}

	encoded, err := json.MarshalIndent(document{Projects: rows}, "", "  ")
	if err != nil {
		return err
	}

	return file.WriteAtomic(ctx, f.Paths.Resolved().Local, append(encoded, '\n'), 0o600)
}

// The local file holds values, never the dashes of the repository's format.
func cleaned(project Project) Project {
	project.Repo = value(project.Repo)
	project.Branch = value(project.Branch)
	if project.Runtimes == nil {
		project.Runtimes = map[string]string{}
	}

	processes := make([]Process, 0, len(project.Processes))
	for _, process := range project.Processes {
		process.Install = value(process.Install)
		if process.Dir == "" {
			process.Dir = RootDir
		}
		if process.Host == "" {
			process.Host = Loopback
		}
		if process.Routes == nil {
			process.Routes = []Route{}
		}

		processes = append(processes, process)
	}
	project.Processes = processes

	return project
}

// Every process path stays under the project's: a row that aims elsewhere is not a project.
func contained(project Project, projects string) bool {
	path := project.Path(projects)
	for _, process := range project.Processes {
		if process.Path(path) == "" {
			return false
		}
	}

	return true
}

// ResolveRoutes turns what the app declared into what the registry stores: a subdomain becomes a whole name under the machine's domain, once, here.
//
// A hostname handed whole is taken as it is, provided it sits under that domain: the tunnel and the DNS of this server carry nothing else.
func ResolveRoutes(domain string, requests []RouteRequest) ([]Route, error) {
	routes := make([]Route, 0, len(requests))

	for _, request := range requests {
		route := Route{Label: request.Label, Port: request.Port, Hostname: request.Hostname}

		switch {
		case request.Subdomain != "" && request.Hostname != "":
			return nil, bad(i18n.T("registry.route.both", request.Label), i18n.T("registry.route.both.fix"))
		case request.Subdomain != "" && domain == "":
			return nil, bad(i18n.T("registry.route.noDomain", request.Subdomain), i18n.T("registry.route.noDomain.fix"))
		case request.Subdomain != "":
			if len(request.Subdomain) > SubdomainMax || !subPattern.MatchString(request.Subdomain) {
				return nil, bad(i18n.T("registry.sub.invalid", request.Subdomain), i18n.T("registry.sub.invalid.fix"))
			}

			route.Hostname = compose(request.Subdomain, domain)
		}

		routes = append(routes, route)
	}

	return routes, nil
}

// A RouteRequest is a route as project.add and project.update receive it, before its name on the web is resolved.
type RouteRequest struct {
	Label     string
	Port      int
	Subdomain string
	Hostname  string
}

func (f *File) validate(ctx sys.Context, project Project, self string) error {
	if !namePattern.MatchString(project.Name) {
		return bad(i18n.T("registry.name.invalid", project.Name), i18n.T("registry.name.invalid.fix"))
	}

	if !validDir(project.Dir) {
		return bad(i18n.T("registry.dir.invalid", project.Dir), i18n.T("registry.dir.invalid.fix", f.Paths.Resolved().Projects))
	}

	if branch := value(project.Branch); branch != "" && !BranchPattern.MatchString(branch) {
		return bad(i18n.T("registry.branch.invalid", branch), i18n.T("registry.branch.invalid.fix"))
	}

	if len(project.Processes) == 0 {
		return bad(i18n.T("registry.processes.empty", project.Name), i18n.T("registry.processes.empty.fix"))
	}

	ids := map[string]bool{}
	held := map[int]string{}
	for _, process := range project.Processes {
		if err := f.validateProcess(ctx, process); err != nil {
			return err
		}

		if ids[process.ID] {
			return bad(i18n.T("registry.process.duplicate", process.ID), i18n.T("registry.process.duplicate.fix"))
		}
		ids[process.ID] = true

		for _, port := range process.Ports() {
			if other, taken := held[port]; taken {
				return bad(i18n.T("registry.port.shared", port, other, process.ID), i18n.T("registry.port.shared.fix"))
			}
			held[port] = process.ID
		}
	}

	return f.checkUnique(ctx, project, self)
}

func (f *File) validateProcess(ctx sys.Context, process Process) error {
	if len(process.ID) > LabelMax || !labelPattern.MatchString(process.ID) {
		return bad(i18n.T("registry.process.id.invalid", process.ID), i18n.T("registry.process.id.invalid.fix"))
	}

	if process.Dir != RootDir && !validDir(process.Dir) {
		return bad(i18n.T("registry.process.dir.invalid", process.ID, process.Dir), i18n.T("registry.process.dir.invalid.fix"))
	}

	for _, port := range process.Ports() {
		if port < 1024 || port > LastPort {
			return bad(i18n.T("registry.port.invalid", port), i18n.T("registry.port.invalid.fix", LastPort, f.FreePort(FirstPort, net.Listening(ctx))))
		}
	}

	if !known(process.PkgMgr) {
		return bad(i18n.T("registry.pkgmgr.unknown", process.PkgMgr), i18n.T("registry.pkgmgr.unknown.fix", strings.Join(contract.PackageManagers, ", ")))
	}

	if process.Cmd == "" {
		return bad(i18n.T("registry.cmd.empty"), i18n.T("registry.cmd.empty.fix"))
	}

	if process.Host != Loopback && !LocalhostPattern.MatchString(process.Host) {
		return bad(i18n.T("registry.host.invalid", process.Host), i18n.T("registry.host.invalid.fix"))
	}

	return f.validateRoutes(process.Routes)
}

func validDir(dir string) bool {
	if dir == "" || strings.HasPrefix(dir, "/") {
		return false
	}

	for _, segment := range strings.Split(dir, "/") {
		if segment == ".." {
			return false
		}
	}

	return true
}

func (f *File) validateRoutes(routes []Route) error {
	labels := map[string]bool{}

	for _, route := range routes {
		if len(route.Label) > LabelMax || !labelPattern.MatchString(route.Label) {
			return bad(i18n.T("registry.route.label.invalid", route.Label), i18n.T("registry.route.label.invalid.fix"))
		}

		if labels[route.Label] {
			return bad(i18n.T("registry.route.label.duplicate", route.Label), i18n.T("registry.route.label.duplicate.fix"))
		}
		labels[route.Label] = true

		if route.Hostname == "" {
			continue
		}

		if len(route.Hostname) > HostnameMax || !hostPattern.MatchString(route.Hostname) {
			return bad(i18n.T("registry.hostname.invalid", route.Hostname), i18n.T("registry.hostname.invalid.fix"))
		}

		if f.Domain == "" || !strings.HasSuffix(route.Hostname, "."+f.Domain) {
			return bad(i18n.T("registry.hostname.foreign", route.Hostname, f.Domain), i18n.T("registry.hostname.foreign.fix", f.Domain))
		}
	}

	return nil
}

// Every port and every name on the web is unique on the machine; self names the row being rewritten, which does not compete with itself.
func (f *File) checkUnique(ctx sys.Context, project Project, self string) error {
	for _, existing := range f.Projects {
		if existing.Name == self {
			continue
		}

		if existing.Name == project.Name {
			return bad(i18n.T("registry.project.declared", project.Name), i18n.T("registry.project.declared.fix"))
		}

		if path.Clean(existing.Dir) == path.Clean(project.Dir) {
			return bad(i18n.T("registry.dir.declared", project.Dir, existing.Name), i18n.T("registry.dir.declared.fix"))
		}

		held := map[int]bool{}
		for _, port := range existing.Ports() {
			held[port] = true
		}
		for _, port := range project.Ports() {
			if held[port] {
				return f.portTaken(ctx, project, port, existing)
			}
		}

		names := map[string]bool{}
		for _, name := range existing.Hostnames() {
			names[name] = true
		}
		for _, name := range project.Hostnames() {
			if names[name] {
				return bad(i18n.T("registry.hostname.taken", name, existing.Name), i18n.T("registry.hostname.taken.fix"))
			}
		}
	}

	return nil
}

// The free port travels twice: in the sentence a human reads, and in the remedy the app applies without parsing it.
func (f *File) portTaken(ctx sys.Context, project Project, port int, existing Project) error {
	free := f.FreePort(port, net.Listening(ctx))

	failure := protocol.NewError(contract.ErrorBadRequest, i18n.T("registry.port.taken", port, existing.Name)).
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

func versioned(name string) error {
	return protocol.NewError(contract.ErrorBadRequest, i18n.T("registry.project.versioned", name)).
		WithFix(i18n.T("registry.project.versioned.fix"))
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

func value(field string) string {
	if field == "-" {
		return ""
	}

	return strings.TrimSpace(field)
}
