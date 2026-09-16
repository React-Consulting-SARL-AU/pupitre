package mise

import (
	"errors"
	"slices"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys"
)

// A Runtime is a tool mise holds at several majors at once. Options run newest
// first, as the manifest lists them: the newest of the majors chosen is the
// machine's default — what a shell outside any project runs, and what a
// project that names no version gets. Prefix is the distribution mise names
// before the version, temurin- for Java.
type Runtime struct {
	Tool    string
	Options []string
	Default string
	Prefix  string
}

var (
	Node   = Runtime{Tool: "node", Options: []string{"24", "22", "20"}, Default: "24"}
	Java   = Runtime{Tool: "java", Options: []string{"25", "21", "17"}, Default: "21", Prefix: "temurin-"}
	Python = Runtime{Tool: "python", Options: []string{"3.13", "3.12", "3.11"}, Default: "3.12"}
	Go     = Runtime{Tool: "go", Options: []string{"1.25", "1.24", "1.23"}, Default: "1.25"}
	PHP    = Runtime{Tool: "php", Options: []string{"8.4", "8.3", "8.2"}, Default: "8.4"}
	Ruby   = Runtime{Tool: "ruby", Options: []string{"3.4", "3.3", "3.2"}, Default: "3.4"}
	Rust   = Runtime{Tool: "rust", Options: []string{"1.98", "1.97", "1.96"}, Default: "1.98"}
)

// Runtimes lists them in the order the contract names them, which is the order the projects screen shows them.
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

// Spec is what mise is asked for: the major behind the distribution, when there is one.
func (r Runtime) Spec(major string) string {
	return r.Prefix + major
}

// Wanted is the majors the configuration asks for, newest first whatever order they were sent in, one copy each.
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

// Held is the majors the machine really carries, newest first, read back from mise rather than from what was asked.
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

// Install puts every wanted major, makes the newest the default and drops the majors no longer asked for. It answers the majors it added.
func (r Runtime) Install(ctx *modules.Context) ([]string, error) {
	wanted := r.Wanted(ctx)

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
		if r.matched(Versions(ctx, r.Tool), major) != "" {
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

func (r Runtime) prune(ctx *modules.Context, wanted []string) error {
	return ctx.Step("prune-"+r.Tool, func() (modules.Outcome, error) {
		stale := r.stale(Versions(ctx, r.Tool), wanted)
		if len(stale) == 0 {
			return modules.Skipped, nil
		}

		for _, version := range stale {
			if err := Uninstall(ctx, r.Tool, version); err != nil {
				return modules.Failed, err
			}
		}

		return modules.Done, nil
	})
}

// Upgrade takes each wanted major to its latest patch, which mise resolves on install, and drops the patch it replaces.
func (r Runtime) Upgrade(ctx *modules.Context) error {
	return ctx.Step("upgrade-"+r.Tool, func() (modules.Outcome, error) {
		changed := false

		for _, major := range r.Wanted(ctx) {
			before := r.matched(Versions(ctx, r.Tool), major)
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
			}

			changed = true
		}

		if !changed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

// Uninstall drops every version of the tool; mise itself stays, the other runtimes share it.
func (r Runtime) Uninstall(ctx *modules.Context) error {
	return ctx.Step("remove-"+r.Tool, func() (modules.Outcome, error) {
		installed := Versions(ctx, r.Tool)
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

// The installed version a major resolves to: the newest under it, as mise lists them ascending.
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
