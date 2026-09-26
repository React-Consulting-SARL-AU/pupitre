package registry

import (
	"sort"
	"strconv"
	"strings"
)

// Relative to the projects user's home; `pupitred env` reads it as that user, who cannot read the registry.
const EnvironmentFile = ".pupitre/environment.json"

// The names are a contract with the clients' own scripts: one is added, never renamed nor removed.
type Environment map[string]string

func (e Environment) List() []string {
	pairs := make([]string, 0, len(e))

	for name, value := range e {
		pairs = append(pairs, name+"="+value)
	}

	sort.Strings(pairs)

	return pairs
}

func MachineEnvironment(projects, domain string) Environment {
	env := Environment{
		"PUPITRE":              "1",
		"PUPITRE_PROJECTS_DIR": projects,
	}

	if domain != "" {
		env["PUPITRE_DOMAIN"] = domain
	}

	return env
}

func (p Project) Environment(projects, domain string) Environment {
	env := MachineEnvironment(projects, domain)

	env["PUPITRE_PROJECT"] = p.Name
	env["PUPITRE_PROJECT_DIR"] = p.Path(projects)

	if url := p.URL(); url != "" {
		env["PUPITRE_PROJECT_URL"] = url
	}

	for _, process := range p.Processes {
		prefix := "PUPITRE_PROCESS_" + envName(process.ID)
		env[prefix+"_PORT"] = strconv.Itoa(process.Port)
		env[prefix+"_URL"] = process.URL()
	}

	return env
}

func (p Project) ProcessEnvironment(projects, domain string, process Process) Environment {
	env := p.Environment(projects, domain)

	env["PUPITRE_PROCESS"] = process.ID
	env["PUPITRE_PROCESS_DIR"] = process.Path(p.Path(projects))
	env["PUPITRE_HOST"] = process.Host
	env["PUPITRE_PORT"] = strconv.Itoa(process.Port)
	env["PUPITRE_URL"] = process.URL()
	env["PUPITRE_LOCAL_URL"] = process.LocalURL()

	if route, published := process.Primary(); published {
		env["PUPITRE_PUBLIC_URL"] = "https://" + route.Hostname
	}

	for _, route := range process.Routes {
		prefix := "PUPITRE_ROUTE_" + envName(route.Label)
		env[prefix+"_PORT"] = strconv.Itoa(route.Port)
		env[prefix+"_URL"] = routeURL(process, route)
	}

	return env
}

func routeURL(process Process, route Route) string {
	if route.Hostname != "" {
		return "https://" + route.Hostname
	}

	return "http://" + process.Host + ":" + strconv.Itoa(route.Port)
}

// Both are DNS labels, so the mapping is one to one.
func envName(id string) string {
	return strings.ToUpper(strings.ReplaceAll(id, "-", "_"))
}

type EnvironmentPlace struct {
	Path string   `json:"path"`
	Env  []string `json:"env"`
}

type EnvironmentDocument struct {
	Machine []string           `json:"machine"`
	Places  []EnvironmentPlace `json:"places"`
}

// A process at the project's root gives the root its own environment; two processes on one folder leave it to the first.
func (f *File) EnvironmentDocument() EnvironmentDocument {
	projects := f.Paths.Resolved().Projects
	document := EnvironmentDocument{Machine: MachineEnvironment(projects, f.Domain).List(), Places: []EnvironmentPlace{}}
	seen := map[string]bool{}

	place := func(path string, env Environment) {
		if seen[path] {
			return
		}

		seen[path] = true
		document.Places = append(document.Places, EnvironmentPlace{Path: path, Env: env.List()})
	}

	for _, project := range f.Projects {
		root := project.Path(projects)

		for _, process := range project.Processes {
			place(process.Path(root), project.ProcessEnvironment(projects, f.Domain, process))
		}

		place(root, project.Environment(projects, f.Domain))
	}

	return document
}

// The deepest declared folder holding dir decides; outside every project, the machine's.
func (d EnvironmentDocument) At(dir string) []string {
	chosen := d.Machine
	depth := -1

	for _, place := range d.Places {
		if dir != place.Path && !strings.HasPrefix(dir, strings.TrimSuffix(place.Path, "/")+"/") {
			continue
		}

		if len(place.Path) > depth {
			chosen = place.Env
			depth = len(place.Path)
		}
	}

	return chosen
}
