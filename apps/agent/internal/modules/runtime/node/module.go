package node

import (
	"pupitre.studio/agent/internal/i18n"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys/user"
)

// pnpm and yarn come from the npm registry: mise's default aqua source verifies GitHub attestations that their releases no longer match.
const (
	pnpmSpec = "npm:pnpm"
	yarnSpec = "npm:yarn"
)

type tool struct {
	field string
	spec  string
}

// The managers ride beside node at one version each; node itself is held at every major chosen.
var managers = []tool{{"bun", "bun"}, {"pnpm", pnpmSpec}, {"yarn", yarnSpec}}

var corepacked = []tool{{"pnpm", pnpmSpec}, {"yarn", yarnSpec}}

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !mise.Present(ctx) {
		return modules.Status{}, nil
	}

	held := mise.Node.Held(ctx)
	if len(held) == 0 {
		return modules.Status{}, nil
	}

	return modules.Status{
		Installed:  true,
		Configured: shell.HasBlock(ctx, ID),
		Version:    describe(ctx),
		Versions:   held,
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	if err := mise.Ensure(ctx); err != nil {
		return err
	}

	if _, err := mise.Node.Install(ctx); err != nil {
		return err
	}

	if _, err := optional(ctx, "install-bun", "bun", "bun"); err != nil {
		return err
	}

	var added []string
	for _, manager := range corepacked {
		installed, err := optional(ctx, "install-"+manager.field, manager.field, manager.spec)
		if err != nil {
			return err
		}

		if installed {
			added = append(added, manager.field)
		}
	}

	// corepack is enabled for the chosen managers alone: enabled globally it rejects the repositories that declare bun as their package manager.
	return ctx.Step("enable-corepack", func() (modules.Outcome, error) {
		if len(added) == 0 {
			return modules.Skipped, nil
		}

		if _, err := user.Run(ctx, shell.User, append([]string{"corepack", "enable"}, added...)...); err != nil {
			ctx.Warn(i18n.T("warn.node.corepack.missing", strings.Join(added, ", "), err.Error()))
		}

		return modules.Done, nil
	})
}

func (Module) Configure(ctx *modules.Context) error {
	return shell.EnsureBlock(ctx, "write-shell-env", ID, block(ctx.Bool("bun")))
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := mise.Node.Upgrade(ctx); err != nil {
		return err
	}

	if err := ctx.Step("upgrade-managers", func() (modules.Outcome, error) {
		before := mise.Installed(ctx)

		present := []string{}
		for _, manager := range managers {
			if before[manager.spec] != "" {
				present = append(present, manager.spec)
			}
		}

		if err := mise.Upgrade(ctx, present...); err != nil {
			return modules.Failed, err
		}

		if describeManagers(mise.Installed(ctx)) == describeManagers(before) {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// mise itself stays: runtime.java and runtime.python share it.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := shell.RemoveBlock(ctx, "remove-shell-env", ID); err != nil {
		return err
	}

	for i := len(managers) - 1; i >= 0; i-- {
		if err := mise.Remove(ctx, "remove-"+managers[i].field, managers[i].spec); err != nil {
			return err
		}
	}

	return mise.Node.Uninstall(ctx)
}

func (m Module) Status(ctx *modules.Context) (modules.Status, error) {
	status, err := m.Check(ctx)
	if err != nil {
		return modules.Status{}, err
	}

	status.State = contract.ServiceUnknown
	if status.Installed {
		status.State = contract.ServiceRunning
	}

	return status, nil
}

func optional(ctx *modules.Context, step, field, spec string) (bool, error) {
	if !ctx.Bool(field) {
		return false, ctx.Step(step, func() (modules.Outcome, error) {
			return modules.Skipped, nil
		})
	}

	return mise.Add(ctx, step, spec, mise.Latest)
}

func describe(ctx *modules.Context) string {
	parts := []string{mise.Node.Describe(ctx)}
	if held := describeManagers(mise.Installed(ctx)); held != "" {
		parts = append(parts, held)
	}

	return strings.Join(parts, " · ")
}

func describeManagers(installed map[string]string) string {
	var parts []string
	for _, manager := range managers {
		if installed[manager.spec] != "" {
			parts = append(parts, manager.field+" "+installed[manager.spec])
		}
	}

	return strings.Join(parts, " · ")
}

func block(bun bool) []byte {
	dirs := []string{shell.LocalBin, shell.MiseShims}
	if bun {
		dirs = append(dirs, shell.BunBin)
	}

	return []byte(shell.PathLines(dirs...) + "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0\nexport MISE_NPM_PACKAGE_MANAGER=npm\n")
}
