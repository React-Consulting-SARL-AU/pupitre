package migrate

import (
	"encoding/json"
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
			Since:   "0.1.0",
			Touches: []Target{TargetProjectsConf, TargetProjects},
			Apply:   projectsLocalToJSON,
		},
		{
			ID:      2,
			Slug:    "projects-processes",
			Since:   "0.2.0",
			Touches: []Target{TargetProjects, TargetEnv},
			Apply:   projectsToProcesses,
		},
		{
			ID:      3,
			Slug:    "projects-boot",
			Since:   "0.3.0",
			Touches: []Target{TargetProjects},
			Apply:   projectsBoot,
		},
		{
			ID:      4,
			Slug:    "runtime-versions",
			Since:   "0.3.0",
			Touches: []Target{TargetInstall},
			Apply:   runtimeVersions,
		},
		{
			ID:      5,
			Slug:    "projects-runtimes",
			Since:   "0.3.0",
			Touches: []Target{TargetProjects},
			Apply:   projectsRuntimes,
		},
		{
			ID:      6,
			Slug:    "key-signers",
			Since:   "0.10.0",
			Touches: []Target{TargetSigners},
			Apply:   keySigners,
		},
	}
}

// The runtimes mise held at one version when this migration was written; the list is frozen with it.
var versionedRuntimes = []string{"node", "java", "python", "go", "php", "ruby", "rust"}

// A runtime asked for one version, and asks for several now: the one it had becomes the list of one it holds. A module already answering in the new form is left as it is.
func runtimeVersions(ctx *Context) error {
	document, present, err := ctx.JSON(TargetInstall)
	if err != nil || !present {
		return err
	}

	config, _ := document["config"].(map[string]any)
	changed := false

	for _, tool := range versionedRuntimes {
		values, _ := config["runtime."+tool].(map[string]any)
		if values == nil {
			continue
		}

		version, single := values[tool+"_version"]
		if !single {
			continue
		}

		if _, several := values[tool+"_versions"]; !several && version != nil && version != "" {
			values[tool+"_versions"] = []any{version}
		}

		delete(values, tool+"_version")
		changed = true
	}

	if !changed {
		return nil
	}

	return ctx.SetJSON(TargetInstall, document)
}

// A project names the runtime versions it runs on. The rows written before the column existed name none, in so many words.
func projectsRuntimes(ctx *Context) error {
	document, present, err := ctx.JSON(TargetProjects)
	if err != nil || !present {
		return err
	}

	entries, _ := document["projects"].([]any)
	changed := false

	for _, entry := range entries {
		fields, _ := entry.(map[string]any)
		if fields == nil {
			continue
		}

		if _, answered := fields["runtimes"]; !answered {
			fields["runtimes"] = map[string]any{}
			changed = true
		}
	}

	if !changed {
		return nil
	}

	return ctx.SetJSON(TargetProjects, document)
}

// A project says whether it starts with the server. The rows written before the column existed never asked for it: they say so in as many words, and a row that already answers is left as it is.
func projectsBoot(ctx *Context) error {
	document, present, err := ctx.JSON(TargetProjects)
	if err != nil || !present {
		return err
	}

	entries, _ := document["projects"].([]any)
	changed := false

	for _, entry := range entries {
		fields, _ := entry.(map[string]any)
		if fields == nil {
			continue
		}

		if _, answered := fields["boot"]; !answered {
			fields["boot"] = false
			changed = true
		}
	}

	if !changed {
		return nil
	}

	return ctx.SetJSON(TargetProjects, document)
}

// A project held one command, one port and one folder; it is a repository now,
// and holds processes, each with its own. A row becomes a project of one
// process. The rows that shared the first segment of their folder shared one
// repository — that is what the old format meant by it, with "-" for the
// repository of every row but the first — and become one project whose folder
// is that segment, one process per row. The debug ports of the environment
// file follow the rows they named.
func projectsToProcesses(ctx *Context) error {
	document, present, err := ctx.JSON(TargetProjects)
	if err != nil || !present {
		return err
	}

	entries, _ := document["projects"].([]any)

	var kept []any
	var rows []registry.Row
	for _, entry := range entries {
		raw, err := json.Marshal(entry)
		if err != nil {
			return err
		}

		if fields, _ := entry.(map[string]any); fields["processes"] != nil {
			kept = append(kept, entry)
			continue
		}

		var row registry.Row
		if err := json.Unmarshal(raw, &row); err != nil {
			return err
		}

		rows = append(rows, row)
	}

	if len(rows) == 0 {
		return nil
	}

	projects, windows := registry.Group(rows)
	for _, project := range projects {
		if len(project.Processes) > 1 {
			ctx.Logf("projects: %d rows under %s become the project %s", len(project.Processes), project.Dir, project.Name)
		}

		encoded, err := json.Marshal(project)
		if err != nil {
			return err
		}

		var fields map[string]any
		if err := json.Unmarshal(encoded, &fields); err != nil {
			return err
		}

		kept = append(kept, fields)
	}

	document["projects"] = kept
	if err := ctx.SetJSON(TargetProjects, document); err != nil {
		return err
	}

	return renameDebugPorts(ctx, windows)
}

// PUPITRE_DEBUG_PORTS named projects; it names windows now, <project>/<process>.
func renameDebugPorts(ctx *Context, windows map[string]string) error {
	lines, present, err := ctx.Lines(TargetEnv)
	if err != nil || !present {
		return err
	}

	changed := false
	for at, line := range lines {
		value, found := strings.CutPrefix(line, env.DebugPortsKey+"=")
		if !found {
			continue
		}

		quote := ""
		if strings.HasPrefix(value, `"`) || strings.HasPrefix(value, "'") {
			quote = value[:1]
		}

		var entries []string
		for _, entry := range strings.Fields(strings.Trim(value, `"'`)) {
			name, port, split := strings.Cut(entry, ":")
			if window, known := windows[name]; split && known {
				entry = window + ":" + port
				changed = true
			}

			entries = append(entries, entry)
		}

		lines[at] = env.DebugPortsKey + "=" + quote + strings.Join(entries, " ") + quote
	}

	if !changed {
		return nil
	}

	return ctx.SetLines(TargetEnv, lines)
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
