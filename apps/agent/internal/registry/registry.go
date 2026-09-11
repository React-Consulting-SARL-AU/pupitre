package registry

import (
	"encoding/json"
	"path"
	"regexp"
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

	FirstPort = 3000
	LastPort  = 65535
)

// A subdomain is a DNS name under the server's domain: one label, or several separated by dots when the client's own certificate covers them.
const (
	subLabel = `[a-z0-9](?:[a-z0-9-]*[a-z0-9])?`

	SubdomainMax = 190
	HostnameMax  = 253
	LabelMax     = 63
)

var (
	namePattern  = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]*$`)
	subPattern   = regexp.MustCompile(`^` + subLabel + `(?:\.` + subLabel + `)*$`)
	labelPattern = regexp.MustCompile(`^` + subLabel + `$`)
	hostPattern  = regexp.MustCompile(`^` + subLabel + `(?:\.` + subLabel + `)+$`)

	// BranchPattern is what git will take on a clone or a checkout, and the app refuses the rest before asking.
	BranchPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$`)

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

// The columns of server/projects.conf are kept verbatim for a versioned row: "-" is a value of the format, not an absence.
type Project struct {
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
	Local   bool    `json:"-"`
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

// Primary is the route of the main port that carries a name on the web, and it is where the project's address comes from.
func (p Project) Primary() (Route, bool) {
	for _, route := range p.Routes {
		if route.Port == p.Port && route.Hostname != "" {
			return route, true
		}
	}

	return Route{}, false
}

func (p Project) Hostnames() []string {
	var names []string
	for _, route := range p.Routes {
		if route.Hostname != "" {
			names = append(names, route.Hostname)
		}
	}

	return names
}

// Ports is every port the project holds on the machine: the main one, and the ones its routes name.
func (p Project) Ports() []int {
	ports := []int{p.Port}
	for _, route := range p.Routes {
		if route.Port != p.Port {
			ports = append(ports, route.Port)
		}
	}

	return ports
}

// The install column when it carries something, the package manager's own command otherwise — and we say which, never guess.
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

func (p Project) Contract(projects string) contract.Project {
	routes := make([]contract.Route, 0, len(p.Routes))
	for _, route := range p.Routes {
		routes = append(routes, contract.Route{Label: route.Label, Port: route.Port, Hostname: route.Hostname})
	}

	return contract.Project{
		Name:    p.Name,
		Dir:     p.Dir,
		Path:    p.Path(projects),
		Repo:    value(p.Repo),
		Branch:  value(p.Branch),
		PkgMgr:  p.PkgMgr,
		Host:    p.Host,
		Port:    p.Port,
		Routes:  routes,
		Cmd:     p.Cmd,
		Install: p.InstallCommand(),
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
			if project.Path(paths.Projects) == "" || project.RootPath(paths.Projects) == "" {
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

// ParseConf reads the repository's own file, whose seventh column is a subdomain by its own specification: it becomes the one route of the row, under the domain the machine has today.
func ParseConf(raw []byte, domain string) []Project {
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
			project.Routes = append(project.Routes, Route{Label: LabelFrom(project.Name), Port: port, Hostname: compose(sub, domain)})
		}
		if len(columns) > 8 {
			project.Install = columns[8]
		}
		if len(columns) > 9 {
			project.Branch = value(columns[9])
		}

		projects = append(projects, project)
	}

	return projects
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

	for at := range parsed.Projects {
		if parsed.Projects[at].Routes == nil {
			parsed.Projects[at].Routes = []Route{}
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

// A Patch is what project.update may change; a nil field is a field left as it was.
type Patch struct {
	Cmd     *string
	Install *string
	Branch  *string
	Routes  *[]Route
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
	if patch.Cmd != nil {
		updated.Cmd = *patch.Cmd
	}
	if patch.Install != nil {
		updated.Install = *patch.Install
	}
	if patch.Branch != nil {
		updated.Branch = *patch.Branch
	}
	if patch.Routes != nil {
		updated.Routes = append([]Route{}, (*patch.Routes)...)
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
	project.Install = value(project.Install)
	project.Branch = value(project.Branch)
	if project.Routes == nil {
		project.Routes = []Route{}
	}

	return project
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

	if project.Dir == "" || strings.HasPrefix(project.Dir, "/") || strings.Contains(project.Dir, "..") {
		return bad(i18n.T("registry.dir.invalid", project.Dir), i18n.T("registry.dir.invalid.fix", f.Paths.Resolved().Projects))
	}

	for _, port := range project.Ports() {
		if port < 1024 || port > LastPort {
			return bad(i18n.T("registry.port.invalid", port), i18n.T("registry.port.invalid.fix", LastPort, f.FreePort(FirstPort, net.Listening(ctx))))
		}
	}

	if !known(project.PkgMgr) {
		return bad(i18n.T("registry.pkgmgr.unknown", project.PkgMgr), i18n.T("registry.pkgmgr.unknown.fix", strings.Join(contract.PackageManagers, ", ")))
	}

	if project.Cmd == "" {
		return bad(i18n.T("registry.cmd.empty"), i18n.T("registry.cmd.empty.fix"))
	}

	if branch := value(project.Branch); branch != "" && !BranchPattern.MatchString(branch) {
		return bad(i18n.T("registry.branch.invalid", branch), i18n.T("registry.branch.invalid.fix"))
	}

	if err := f.validateRoutes(project.Routes); err != nil {
		return err
	}

	return f.checkUnique(ctx, project, self)
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
