package node

import (
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys/user"
)

var tools = []string{"node", "bun", "pnpm"}

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

	installed := mise.Installed(ctx)
	if installed["node"] == "" {
		return modules.Status{}, nil
	}

	return modules.Status{
		Installed:  true,
		Configured: shell.HasBlock(ctx, ID),
		Version:    describe(installed),
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	if err := mise.Ensure(ctx); err != nil {
		return err
	}

	if _, err := mise.Add(ctx, "install-node", "node", ctx.String("node_version")); err != nil {
		return err
	}

	if _, err := optional(ctx, "install-bun", "bun"); err != nil {
		return err
	}

	pnpmAdded, err := optional(ctx, "install-pnpm", "pnpm")
	if err != nil {
		return err
	}

	// corepack is enabled for pnpm alone: enabled globally it rejects the repositories that declare bun as their package manager.
	return ctx.Step("enable-corepack", func() (modules.Outcome, error) {
		if !pnpmAdded {
			return modules.Skipped, nil
		}

		if _, err := user.Run(ctx, shell.User, "corepack", "enable", "pnpm"); err != nil {
			ctx.Warn("corepack indisponible, pnpm gardera sa version globale : " + err.Error())
		}

		return modules.Done, nil
	})
}

func (Module) Configure(ctx *modules.Context) error {
	return shell.EnsureBlock(ctx, "write-shell-env", ID, block(ctx.Bool("bun")))
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-runtimes", func() (modules.Outcome, error) {
		before := mise.Installed(ctx)

		present := []string{}
		for _, tool := range tools {
			if before[tool] != "" {
				present = append(present, tool)
			}
		}

		if err := mise.Upgrade(ctx, present...); err != nil {
			return modules.Failed, err
		}

		if describe(mise.Installed(ctx)) == describe(before) {
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

	for _, tool := range []string{"pnpm", "bun", "node"} {
		if err := mise.Remove(ctx, "remove-"+tool, tool); err != nil {
			return err
		}
	}

	return nil
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

func optional(ctx *modules.Context, step, tool string) (bool, error) {
	if !ctx.Bool(tool) {
		return false, ctx.Step(step, func() (modules.Outcome, error) {
			return modules.Skipped, nil
		})
	}

	return mise.Add(ctx, step, tool, mise.Latest)
}

func describe(installed map[string]string) string {
	var parts []string
	for _, tool := range tools {
		if installed[tool] != "" {
			parts = append(parts, tool+" "+installed[tool])
		}
	}

	return strings.Join(parts, " · ")
}

func block(bun bool) []byte {
	dirs := []string{shell.LocalBin, shell.MiseShims}
	if bun {
		dirs = append(dirs, shell.BunBin)
	}

	return []byte(shell.PathLines(dirs...) + "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0\n")
}
