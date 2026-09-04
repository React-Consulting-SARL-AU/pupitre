package agents

import (
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/mise"
)

// mise carries the npm and pypi backends, so an agent CLI installs, pins and upgrades the same way a runtime does, and lands on a shim every shell already has on PATH.
type CLI struct {
	Tool    string
	Program string
}

func (c CLI) Path() string {
	return mise.ShimsDir + "/" + c.Program
}

func (c CLI) Present(ctx *modules.Context) bool {
	return mise.Present(ctx) && mise.Installed(ctx)[c.Tool] != ""
}

func (c CLI) Version(ctx *modules.Context) string {
	version := mise.Installed(ctx)[c.Tool]
	if version == "" || version == mise.Latest {
		return ""
	}

	return version
}

func (c CLI) Install(ctx *modules.Context) error {
	if err := mise.Ensure(ctx); err != nil {
		return err
	}

	_, err := mise.Add(ctx, "install-cli", c.Tool, mise.Latest)

	return err
}

func (c CLI) Upgrade(ctx *modules.Context) error {
	return ctx.Step("upgrade-cli", func() (modules.Outcome, error) {
		before := mise.Installed(ctx)[c.Tool]
		if before == "" {
			return modules.Skipped, nil
		}

		if err := mise.Upgrade(ctx, c.Tool); err != nil {
			return modules.Failed, err
		}

		if mise.Installed(ctx)[c.Tool] == before {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func (c CLI) Remove(ctx *modules.Context) error {
	return mise.Remove(ctx, "remove-cli", c.Tool)
}
