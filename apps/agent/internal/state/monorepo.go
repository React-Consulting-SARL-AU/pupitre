package state

import (
	"encoding/json"
	"regexp"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/registry"
)

// A Turborepo runs every workspace from its root, in one window: the project holds the root's command and one port per workspace that listens.
const turboConfig = "turbo.json"

var (
	pnpmPackages = regexp.MustCompile(`(?m)^\s*-\s*['"]?([^'"\s#]+)['"]?`)
	notLabel     = regexp.MustCompile(`[^a-z0-9-]+`)
	dashes       = regexp.MustCompile(`-{2,}`)
	scope        = regexp.MustCompile(`^@[^/]+/`)
)

type workspace struct {
	name string
	port int
	host string
}

// What the monorepo proposes, or nothing when the root is not one: a turbo.json and a list of workspaces are what makes it one.
func (r *Reader) monorepo(files sources, manifest packageJSON, pkgmgr string, taken map[int]bool) (contract.DetectedProcess, bool) {
	if !files.exists(turboConfig) {
		return contract.DetectedProcess{}, false
	}

	globs := manifest.workspaceGlobs()
	if len(globs) == 0 {
		globs = pnpmWorkspaces(files.read("pnpm-workspace.yaml"))
	}
	if len(globs) == 0 {
		return contract.DetectedProcess{}, false
	}

	var routes []contract.DetectedRoute
	labels := map[string]bool{}
	host := ""

	for _, member := range files.workspaces(globs) {
		port := r.freePort(member.port, taken)
		taken[port] = true

		routes = append(routes, contract.DetectedRoute{Label: uniqueLabel(member.name, labels), Port: port})

		if host == "" {
			host = member.host
		}
	}

	if len(routes) == 0 {
		return contract.DetectedProcess{}, false
	}

	return contract.DetectedProcess{
		Dir:      registry.RootDir,
		PkgMgr:   pkgmgr,
		Install:  installCommandOf(pkgmgr),
		Cmd:      turboCommand(pkgmgr),
		PortHint: routes[0].Port,
		HostHint: host,
		Routes:   routes,
	}, true
}

// The workspaces that declare a start script naming a port, in the order the globs list them, then by folder name.
func (s sources) workspaces(globs []string) []workspace {
	var members []workspace

	for _, glob := range globs {
		for _, dir := range s.expand(glob) {
			member := s.sub(dir)
			manifest := member.packageJSON()
			if !manifest.Present {
				continue
			}

			script := manifest.resolved(manifest.startScript())
			port := declaredPort(member, script)
			if port == 0 {
				continue
			}

			name := manifest.Name
			if name == "" {
				name = dir[strings.LastIndex(dir, "/")+1:]
			}

			members = append(members, workspace{name: name, port: port, host: declaredHost(script)})
		}
	}

	return members
}

// One trailing "*" is the whole of what package managers write: apps/*, packages/*. A literal path names one folder.
func (s sources) expand(glob string) []string {
	glob = strings.TrimSuffix(strings.TrimPrefix(glob, "./"), "/")
	if strings.HasPrefix(glob, "!") {
		return nil
	}

	parent, wildcard := strings.CutSuffix(glob, "/*")
	if !wildcard {
		if s.exists(glob) {
			return []string{glob}
		}

		return nil
	}

	var dirs []string
	for _, name := range s.folders(parent) {
		dirs = append(dirs, parent+"/"+name)
	}

	return dirs
}

// The workspaces field of a package.json: a list, or the object npm and yarn also accept.
func (p packageJSON) workspaceGlobs() []string {
	if len(p.Workspaces) == 0 {
		return nil
	}

	var globs []string
	if err := json.Unmarshal(p.Workspaces, &globs); err == nil {
		return globs
	}

	var shaped struct {
		Packages []string `json:"packages"`
	}
	if err := json.Unmarshal(p.Workspaces, &shaped); err == nil {
		return shaped.Packages
	}

	return nil
}

func pnpmWorkspaces(yaml string) []string {
	_, packages, found := strings.Cut(yaml, "packages:")
	if !found {
		return nil
	}

	var globs []string
	for _, match := range pnpmPackages.FindAllStringSubmatch(packages, -1) {
		globs = append(globs, match[1])
	}

	return globs
}

// A workspace name becomes the label of its route: one DNS label, since the app puts it in front of the subdomain.
func uniqueLabel(name string, labels map[string]bool) string {
	label := scope.ReplaceAllString(strings.ToLower(name), "")
	label = strings.Trim(dashes.ReplaceAllString(notLabel.ReplaceAllString(label, "-"), "-"), "-")
	if label == "" {
		label = "app"
	}

	candidate := label
	for rank := 2; labels[candidate]; rank++ {
		candidate = label + "-" + strconv.Itoa(rank)
	}
	labels[candidate] = true

	return candidate
}

func turboCommand(pkgmgr string) string {
	switch pkgmgr {
	case "bun":
		return "bunx turbo run dev"
	case "pnpm":
		return "pnpm exec turbo run dev"
	case "npm":
		return "npx turbo run dev"
	}

	return ""
}
