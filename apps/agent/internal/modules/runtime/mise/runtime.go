package mise

import (
	"errors"
	"slices"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
)

// Options run newest first: the newest major chosen becomes the machine's default.
type Runtime struct {
	Tool    string
	Options []string
	Default string
	Prefix  string
}

// Floors: python-build-standalone starts at 3.9; PHP 8.0 and Ruby 3.1 are the oldest to build on Ubuntu 24.04's OpenSSL 3.
var (
	Node = Runtime{
		Tool:    "node",
		Options: []string{"26", "25", "24", "23", "22", "21", "20", "19", "18", "17", "16", "15", "14", "13", "12", "11", "10"},
		Default: "24",
	}
	Java = Runtime{
		Tool:    "java",
		Options: []string{"26", "25", "24", "23", "22", "21", "20", "19", "18", "17", "16", "11", "8"},
		Default: "21",
		Prefix:  "temurin-",
	}
	Python = Runtime{
		Tool:    "python",
		Options: []string{"3.14", "3.13", "3.12", "3.11", "3.10", "3.9"},
		Default: "3.12",
	}
	Go = Runtime{
		Tool:    "go",
		Options: []string{"1.27", "1.26", "1.25", "1.24", "1.23", "1.22", "1.21", "1.20", "1.19", "1.18"},
		Default: "1.25",
	}
	PHP = Runtime{
		Tool:    "php",
		Options: []string{"8.5", "8.4", "8.3", "8.2", "8.1", "8.0"},
		Default: "8.4",
	}
	Ruby = Runtime{
		Tool:    "ruby",
		Options: []string{"4.0", "3.4", "3.3", "3.2", "3.1"},
		Default: "3.4",
	}
	Rust = Runtime{
		Tool:    "rust",
		Options: []string{"1.98", "1.97", "1.96", "1.95", "1.94", "1.93", "1.92", "1.91", "1.90"},
		Default: "1.98",
	}
)

// The contract's order, which is the order the projects screen shows.
func Runtimes() []Runtime {
	return []Runtime{Node, Java, Python, Go, PHP, Ruby, Rust}
}

func RuntimeOf(tool string) (Runtime, bool) {
	for _, runtime := range Runtimes() {
		if runtime.Tool == tool {
			return runtime, true
		}
	}

	return Runtime{}, false
}

func (r Runtime) Key() string {
	return r.Tool + "_versions"
}

func (r Runtime) Field(label, help string) contract.Field {
	return contract.Field{Key: r.Key(), Kind: contract.FieldVersions, Label: label, Help: help, Options: r.Options, Default: []string{r.Default}}
}

func (r Runtime) Spec(major string) string {
	return r.Prefix + major
}

func (r Runtime) Wanted(ctx *modules.Context) []string {
	sent := ctx.StringList(r.Key())

	var wanted []string

	for _, option := range r.Options {
		if slices.Contains(sent, option) {
			wanted = append(wanted, option)
		}
	}

	return wanted
}

func (r Runtime) Held(ctx sys.Context) []string {
	installed := Versions(ctx, r.Tool)

	var held []string

	for _, option := range r.Options {
		if r.matched(installed, option) != "" {
			held = append(held, option)
		}
	}

	return held
}

func (r Runtime) Describe(ctx sys.Context) string {
	installed := Versions(ctx, r.Tool)
	if len(installed) == 0 {
		return ""
	}

	return r.Tool + " " + strings.Join(installed, " · ")
}

func (r Runtime) Install(ctx *modules.Context) ([]string, error) {
	wanted := r.Wanted(ctx)

	// A configuration answered on options since rotated out still asks for a runtime.
	if len(wanted) == 0 {
		ctx.Warn(i18n.T("warn.mise.options.rotated", r.Tool, strings.Join(ctx.StringList(r.Key()), ", "), r.Default))
		wanted = []string{r.Default}
	}

	var added []string

	for _, major := range wanted {
		put, err := r.put(ctx, major)
		if err != nil {
			return added, err
		}

		if put {
			added = append(added, major)
		}
	}

	if err := r.use(ctx, wanted[0]); err != nil {
		return added, err
	}

	return added, r.prune(ctx, wanted)
}

func (r Runtime) put(ctx *modules.Context, major string) (bool, error) {
	put := false

	err := ctx.Step("install-"+r.Tool+"-"+major, func() (modules.Outcome, error) {
		installed, err := versionsOf(ctx, r.Tool)
		if err != nil {
			return modules.Failed, err
		}

		if r.matched(installed, major) != "" {
			return modules.Skipped, nil
		}

		if err := install(ctx, r.Tool, r.Spec(major)); err != nil {
			return modules.Failed, err
		}

		if r.matched(Versions(ctx, r.Tool), major) == "" {
			return modules.Failed, errors.New(i18n.T("modules.mise.tool_not_installed", r.Tool, r.Spec(major)))
		}

		put = true

		return modules.Done, nil
	})

	return put, err
}

func (r Runtime) use(ctx *modules.Context, major string) error {
	return ctx.Step("use-"+r.Tool, func() (modules.Outcome, error) {
		if Global(ctx)[r.Tool] == r.Spec(major) {
			return modules.Skipped, nil
		}

		return modules.Done, Use(ctx, r.Tool, r.Spec(major))
	})
}

// A major a project pins, or one the module never put there, is the client's: it stays, and the step says so.
func (r Runtime) prune(ctx *modules.Context, wanted []string) error {
	return ctx.Step("prune-"+r.Tool, func() (modules.Outcome, error) {
		installed, err := versionsOf(ctx, r.Tool)
		if err != nil {
			return modules.Failed, err
		}

		stale := r.stale(installed, wanted)
		if len(stale) == 0 {
			return modules.Skipped, nil
		}

		pinned := pins(ctx, r.Tool)

		for _, version := range stale {
			major := r.majorOf(version)

			switch {
			case major == "":
				ctx.Warn(i18n.T("warn.mise.prune.foreign", r.Tool, version))
			case len(pinned[major]) > 0:
				ctx.Warn(i18n.T("warn.mise.prune.pinned", r.Tool, version, strings.Join(pinned[major], ", ")))
			default:
				if err := Uninstall(ctx, r.Tool, version); err != nil {
					return modules.Failed, err
				}
			}
		}

		return modules.Done, nil
	})
}

// The replaced patch takes its venvs, gem homes and global packages with it, so pinned projects are named for a rebuild.
func (r Runtime) Upgrade(ctx *modules.Context) ([]string, error) {
	var moved []string

	err := ctx.Step("upgrade-"+r.Tool, func() (modules.Outcome, error) {
		for _, major := range r.Wanted(ctx) {
			installed, err := versionsOf(ctx, r.Tool)
			if err != nil {
				return modules.Failed, err
			}

			before := r.matched(installed, major)
			if before == "" {
				continue
			}

			if err := install(ctx, r.Tool, r.Spec(major)); err != nil {
				return modules.Failed, err
			}

			after := r.matched(Versions(ctx, r.Tool), major)
			if after == before {
				continue
			}

			for _, version := range r.under(Versions(ctx, r.Tool), major) {
				if version == after {
					continue
				}

				if err := Uninstall(ctx, r.Tool, version); err != nil {
					return modules.Failed, err
				}

				ctx.Warn(i18n.T("warn.mise.upgrade.replaced", r.Tool, version, after, projectsOr(pins(ctx, r.Tool)[major])))
			}

			moved = append(moved, major)
		}

		if len(moved) == 0 {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})

	return moved, err
}

// mise itself stays: the other runtimes share it.
func (r Runtime) Uninstall(ctx *modules.Context) error {
	return ctx.Step("remove-"+r.Tool, func() (modules.Outcome, error) {
		installed, err := versionsOf(ctx, r.Tool)
		if err != nil {
			return modules.Failed, err
		}

		if len(installed) == 0 {
			return modules.Skipped, nil
		}

		for _, version := range installed {
			if err := Uninstall(ctx, r.Tool, version); err != nil {
				return modules.Failed, err
			}
		}

		return modules.Done, nil
	})
}

// mise lists versions ascending, so the last one under the major is the newest.
func (r Runtime) matched(installed []string, major string) string {
	under := r.under(installed, major)
	if len(under) == 0 {
		return ""
	}

	return under[len(under)-1]
}

func (r Runtime) under(installed []string, major string) []string {
	var under []string

	for _, version := range installed {
		if Matches(version, r.Spec(major)) {
			under = append(under, version)
		}
	}

	return under
}

func (r Runtime) majorOf(version string) string {
	for _, option := range r.Options {
		if Matches(version, r.Spec(option)) {
			return option
		}
	}

	return ""
}

func pins(ctx sys.Context, tool string) map[string][]string {
	pinned := map[string][]string{}

	for _, project := range registry.Load(ctx, registry.Paths{}).Projects {
		if major := project.Runtimes[tool]; major != "" {
			pinned[major] = append(pinned[major], project.Name)
		}
	}

	return pinned
}

func projectsOr(names []string) string {
	if len(names) == 0 {
		return i18n.T("modules.mise.no_project")
	}

	return strings.Join(names, ", ")
}

func (r Runtime) stale(installed, wanted []string) []string {
	var stale []string

	for _, version := range installed {
		kept := false

		for _, major := range wanted {
			if Matches(version, r.Spec(major)) {
				kept = true
				break
			}
		}

		if !kept {
			stale = append(stale, version)
		}
	}

	return stale
}
