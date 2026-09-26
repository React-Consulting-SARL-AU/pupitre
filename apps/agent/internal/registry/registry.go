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

	// Machine state rather than configuration, hence /var/lib and not /etc.
	DefaultRunning = "/var/lib/pupitre/projects.running.json"

	DefaultLock = "/var/lib/pupitre/projects.lock"

	FirstPort = 3000
	LastPort  = 65535
)

const (
	subLabel = `[a-z0-9](?:[a-z0-9-]*[a-z0-9])?`

	SubdomainMax = 190
	HostnameMax  = 253
	LabelMax     = 63

	Loopback = "127.0.0.1"
)

var (
	namePattern  = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]*$`)
	subPattern   = regexp.MustCompile(`^` + subLabel + `(?:\.` + subLabel + `)*$`)
	labelPattern = regexp.MustCompile(`^` + subLabel + `$`)
	hostPattern  = regexp.MustCompile(`^` + subLabel + `(?:\.` + subLabel + `)+$`)

	BranchPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$`)

	LocalhostPattern = regexp.MustCompile(`^(?:` + subLabel + `\.)+localhost$`)

	notLabel = regexp.MustCompile(`[^a-z0-9-]+`)
	dashes   = regexp.MustCompile(`-{2,}`)
)

func LabelFrom(name string) string {
	label := strings.Trim(dashes.ReplaceAllString(notLabel.ReplaceAllString(strings.ToLower(name), "-"), "-"), "-")
	if label == "" {
		return "web"
	}

	return label
}

// Hostname is stored resolved: nothing ever recomposes it from a subdomain and the current domain.
type Route struct {
	Label    string `json:"label"`
	Port     int    `json:"port"`
	Hostname string `json:"hostname,omitempty"`
}

const RootDir = "."

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

type Project struct {
	Name      string    `json:"name"`
	Dir       string    `json:"dir"`
	Repo      string    `json:"repo,omitempty"`
	Branch    string    `json:"branch,omitempty"`
	Processes []Process `json:"processes"`
	Boot      bool      `json:"boot"`
	// By mise tool; an absent tool runs at the machine's default version.
	Runtimes map[string]string `json:"runtimes"`
	Local    bool              `json:"-"`
}

func (p Process) IsService() bool {
	return p.PkgMgr == "service"
}

func (p Process) Primary() (Route, bool) {
	for _, route := range p.Routes {
		if route.Port == p.Port && route.Hostname != "" {
			return route, true
		}
	}

	return Route{}, false
}

// Without a published main route, "https://…" would be an address that does not answer.
func (p Process) URL() string {
	if route, published := p.Primary(); published {
		return "https://" + route.Hostname
	}

	return p.LocalURL()
}

func (p Process) LocalURL() string {
	return "http://" + p.Host + ":" + strconv.Itoa(p.Port)
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

func (p Process) Ports() []int {
	ports := []int{p.Port}

	for _, route := range p.Routes {
		if route.Port != p.Port {
			ports = append(ports, route.Port)
		}
	}

	return ports
}

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

func (p Process) Path(projectPath string) string {
	if p.Dir == "" || p.Dir == RootDir {
		return projectPath
	}

	return Under(projectPath, p.Dir)
}

// Unambiguous because neither a project name nor a process id admits a slash.
func Window(project, process string) string {
	return project + "/" + process
}

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

func (p Project) RootPath(projects string) string {
	return p.Path(projects)
}

func (p Project) Primary() (Process, Route, bool) {
	for _, process := range p.Processes {
		if route, published := process.Primary(); published {
			return process, route, true
		}
	}

	return Process{}, Route{}, false
}

func (p Project) URL() string {
	if process, _, published := p.Primary(); published {
		return process.URL()
	}

	if len(p.Processes) == 0 {
		return ""
	}

	return p.Processes[0].URL()
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

// Returns "" for a path escaping root: the registry file is hand-edited.
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
	Backups  string
	// Empty means no lock, which the tests rely on.
	Lock string
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
	Domain   string

	// Local rows that do not read as projects, carried through every write untouched rather than lost.
	kept []json.RawMessage
	// An unparseable local file refuses every write instead of reading as an empty registry.
	problem error
}

// On equal names the local row wins, while the order stays that of first appearance.
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

		var rows []localRow
		if source.local {
			rows, err = parseRows(raw)
			if err != nil {
				loaded.problem = unreadable(paths, err)
				said(ctx, source.path+" unreadable", "%s: unreadable, every write on the registry is refused: %s", source.path, err)

				continue
			}
		} else {
			for _, project := range ParseConf(raw, loaded.Domain) {
				rows = append(rows, localRow{project: project, ok: true})
			}
		}

		for _, row := range rows {
			project := row.project
			if !row.ok || !namePattern.MatchString(project.Name) || project.Path(paths.Projects) == "" || len(project.Processes) == 0 || !contained(project, paths.Projects) {
				if source.local {
					loaded.kept = append(loaded.kept, row.raw)
					said(ctx, source.path+" row "+summary(row.raw), "%s: row %s set aside, not a project: kept as it is", source.path, summary(row.raw))
				}

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

// The registry is read at every snapshot, so a problem is logged once per session rather than every few seconds.
func said(ctx sys.Context, key, format string, args ...any) {
	_ = ctx.Once("registry: "+key, func() error {
		ctx.Logf(format, args...)

		return nil
	})
}

func (f *File) Problem() error {
	return f.problem
}

func unreadable(paths Paths, cause error) error {
	fix := i18n.T("registry.local.unreadable.fix", paths.Local)
	if paths.Backups != "" {
		fix = i18n.T("registry.local.unreadable.backups.fix", paths.Local, paths.Backups)
	}

	return bad(i18n.T("registry.local.unreadable", paths.Local, cause.Error()), fix)
}

func summary(raw json.RawMessage) string {
	var named struct {
		Name string `json:"name"`
	}

	if err := json.Unmarshal(raw, &named); err == nil && named.Name != "" {
		return strconv.Quote(named.Name)
	}

	text := string(raw)
	if len(text) > 60 {
		text = text[:60] + "…"
	}

	return text
}

func domainOf(ctx sys.Context) string {
	domain, _, err := env.Get(ctx, env.DomainKey)
	if err != nil {
		return ""
	}

	return domain
}

// The legacy one-process shape: a projects.conf line, or a local entry written before processes existed.
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

// The seventh column is a subdomain: it becomes the row's single route, under the machine's current domain.
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

// Rows sharing the first segment of their dir share a repository; the map gives, by row name, the window each became.
func Group(rows []Row) ([]Project, map[string]string) {
	var order []string
	byRoot := map[string][]Row{}
	shared := map[string]bool{}

	for _, row := range rows {
		root, _ := rootOf(row.Dir)
		// A dir escaping the root groups with nothing, so Load drops the row alone.
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
	Projects []json.RawMessage `json:"projects"`
}

type localRow struct {
	raw     json.RawMessage
	project Project
	ok      bool
}

// Rows that are not projects are dropped here; Load keeps them for the next write.
func ParseLocal(raw []byte) ([]Project, error) {
	rows, err := parseRows(raw)
	if err != nil {
		return nil, err
	}

	projects := make([]Project, 0, len(rows))

	for _, row := range rows {
		if row.ok {
			projects = append(projects, row.project)
		}
	}

	return projects, nil
}

func parseRows(raw []byte) ([]localRow, error) {
	var parsed document
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, err
	}

	rows := make([]localRow, 0, len(parsed.Projects))

	for _, entry := range parsed.Projects {
		row := localRow{raw: entry}

		if err := json.Unmarshal(entry, &row.project); err == nil {
			row.ok = true
			for at := range row.project.Processes {
				if row.project.Processes[at].Routes == nil {
					row.project.Processes[at].Routes = []Route{}
				}
				if row.project.Processes[at].Dir == "" {
					row.project.Processes[at].Dir = RootDir
				}
			}
		}

		rows = append(rows, row)
	}

	return rows, nil
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

// A nil field is left unchanged; Processes replaces the whole list.
type Patch struct {
	Branch    *string
	Boot      *bool
	Runtimes  *map[string]string
	Processes *[]Process
}

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

// Only local rows are rewritten: the repository's rows are composed from the domain at every load.
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

func (f *File) Removable(name string) error {
	project, known := f.Get(name)
	if !known {
		return NotFound(name)
	}

	if !project.Local {
		return versioned(name)
	}

	return nil
}

func (f *File) Remove(ctx sys.Context, name string) (Project, error) {
	if err := f.Removable(name); err != nil {
		return Project{}, err
	}

	project, _ := f.Get(name)

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
	if f.problem != nil {
		return f.problem
	}

	entries := make([]json.RawMessage, 0, len(rows)+len(f.kept))

	for _, row := range rows {
		encoded, err := json.Marshal(row)
		if err != nil {
			return err
		}

		entries = append(entries, encoded)
	}

	entries = append(entries, f.kept...)

	encoded, err := json.MarshalIndent(document{Projects: entries}, "", "  ")
	if err != nil {
		return err
	}

	return file.WriteAtomic(ctx, f.Paths.Resolved().Local, append(encoded, '\n'), 0o600)
}

// The local file stores plain values, never the "-" placeholders of the repository's format.
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

func contained(project Project, projects string) bool {
	path := project.Path(projects)

	for _, process := range project.Processes {
		if process.Path(path) == "" {
			return false
		}
	}

	return true
}

// A whole hostname is taken as is here; validateRoutes still requires it under the machine's domain.
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

type RouteRequest struct {
	Label     string
	Port      int
	Subdomain string
	Hostname  string
}

func (f *File) validate(ctx sys.Context, project Project, rewritten string) error {
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

	return f.checkUnique(ctx, project, rewritten)
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

func (f *File) checkUnique(ctx sys.Context, project Project, rewritten string) error {
	for _, existing := range f.Projects {
		if existing.Name == rewritten {
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
