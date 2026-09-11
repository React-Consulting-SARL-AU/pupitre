package migrate

import (
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys/env"
)

// The ledger this binary carries, in the order it runs.
//
// One entry per change of shape, its identifier fixed for good: the machine
// remembers numbers, so a number that moves is a migration that runs twice or
// not at all. Adding one is the whole of what a shape change costs — see
// docs/contracts/config-migrations.md.
func All() []Migration {
	return []Migration{
		{
			ID:      1,
			Slug:    "projects-local-json",
			Since:   "0.4.0",
			Touches: []Target{TargetProjectsConf, TargetProjects},
			Apply:   projectsLocalToJSON,
		},
	}
}

// The columns of the file the agent wrote before it kept its registry as JSON, in order.
const (
	confName = iota
	confDir
	confRepo
	confPkgMgr
	confHost
	confPort
	confSub
	confCmd
	confInstall
	confBranch

	confColumns = 8
)

// The local registry was a "|"-separated file of eight, nine or ten columns,
// and a project held one port and one subdomain. It is a JSON document now, and
// a project holds routes, each with the whole name it answers to on the web:
// the subdomain of a row becomes the hostname of its one route, under the
// domain the machine publishes today. Without a domain the route keeps its
// port and loses nothing else — the subdomain is written to the journal so a
// reader can give it back from the project's configuration.
func projectsLocalToJSON(ctx *Context) error {
	lines, present, err := ctx.Lines(TargetProjectsConf)
	if err != nil || !present {
		return err
	}

	domain := domainOf(ctx)
	projects := existingProjects(ctx)
	declared := map[string]bool{}
	for _, project := range projects {
		name, _ := project.(map[string]any)["name"].(string)
		declared[name] = true
	}

	for _, line := range lines {
		row, ok := parseConfRow(line)
		if !ok {
			continue
		}

		name, _ := row["name"].(string)
		if declared[name] {
			continue
		}

		if sub, _ := row["subdomain"].(string); sub != "" && domain == "" {
			ctx.Logf("projects: %s kept its subdomain %q without a hostname: the machine has no %s", name, sub, env.DomainKey)
		}

		projects = append(projects, routed(row, domain))
		declared[name] = true
	}

	if err := ctx.SetJSON(TargetProjects, map[string]any{"projects": projects}); err != nil {
		return err
	}

	return ctx.Remove(TargetProjectsConf)
}

// A run cut short between the write and the removal leaves both files: what the JSON already holds wins, and the old rows only fill what it lacks.
func existingProjects(ctx *Context) []any {
	document, present, err := ctx.JSON(TargetProjects)
	if err != nil || !present {
		return []any{}
	}

	projects, _ := document["projects"].([]any)
	if projects == nil {
		return []any{}
	}

	return projects
}

func parseConfRow(line string) (map[string]any, bool) {
	line = strings.TrimRight(line, "\r")
	if trimmed := strings.TrimSpace(line); trimmed == "" || strings.HasPrefix(trimmed, "#") {
		return nil, false
	}

	columns := strings.Split(line, "|")
	if len(columns) < confColumns {
		return nil, false
	}

	port, err := strconv.Atoi(columns[confPort][strings.LastIndex(columns[confPort], ":")+1:])
	if err != nil {
		return nil, false
	}

	row := map[string]any{
		"name":      columns[confName],
		"dir":       columns[confDir],
		"repo":      dashless(columns[confRepo]),
		"pkgmgr":    columns[confPkgMgr],
		"host":      columns[confHost],
		"port":      port,
		"subdomain": dashless(columns[confSub]),
		"cmd":       columns[confCmd],
	}
	if len(columns) > confInstall {
		row["install"] = dashless(columns[confInstall])
	}
	if len(columns) > confBranch {
		row["branch"] = dashless(columns[confBranch])
	}

	return row, true
}

func routed(row map[string]any, domain string) map[string]any {
	sub, _ := row["subdomain"].(string)
	delete(row, "subdomain")

	routes := []any{}
	if sub != "" {
		name, _ := row["name"].(string)
		route := map[string]any{"label": registry.LabelFrom(name), "port": row["port"]}
		if domain != "" {
			route["hostname"] = sub + "." + domain
		}
		routes = append(routes, route)
	}
	row["routes"] = routes

	for _, key := range []string{"repo", "install", "branch"} {
		if held, _ := row[key].(string); held == "" {
			delete(row, key)
		}
	}

	return row
}

func domainOf(ctx *Context) string {
	lines, present, err := ctx.Lines(TargetEnv)
	if err != nil || !present {
		return ""
	}

	for _, line := range lines {
		if value, found := strings.CutPrefix(line, env.DomainKey+"="); found {
			return strings.TrimSpace(value)
		}
	}

	return ""
}

func dashless(field string) string {
	if field == "-" {
		return ""
	}

	return strings.TrimSpace(field)
}
