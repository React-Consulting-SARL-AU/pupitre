package mise

import "pupitre.studio/agent/internal/modules"

// mise's npm and pypi backends let a CLI install, pin and upgrade like a runtime, onto a shim already on PATH.
type CLI struct {
	Tool    string
	Program string
}

func (c CLI) Path() string {
	return ShimsDir + "/" + c.Program
}

func (c CLI) Present(ctx *modules.Context) bool {
	return Present(ctx) && Installed(ctx)[c.Tool] != ""
}

func (c CLI) Version(ctx *modules.Context) string {
	version := Installed(ctx)[c.Tool]
	if version == "" || version == Latest {
		return ""
	}

	return version
}

func (c CLI) Install(ctx *modules.Context) error {
	if err := Ensure(ctx); err != nil {
		return err
	}

	_, err := Add(ctx, "install-cli", c.Tool, Latest)

	return err
}

func (c CLI) Upgrade(ctx *modules.Context) error {
	return ctx.Step("upgrade-cli", func() (modules.Outcome, error) {
		before := Installed(ctx)[c.Tool]
		if before == "" {
			return modules.Skipped, nil
		}

		if err := Upgrade(ctx, c.Tool); err != nil {
			return modules.Failed, err
		}

		if Installed(ctx)[c.Tool] == before {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func (c CLI) Remove(ctx *modules.Context) error {
	return Remove(ctx, "remove-cli", c.Tool)
}
