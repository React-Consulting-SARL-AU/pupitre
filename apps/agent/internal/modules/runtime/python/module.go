package python

import (
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/modules/runtime/shell"
)

var tools = []string{"python", "uv"}

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
	if installed["python"] == "" {
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

	if _, err := mise.Add(ctx, "install-uv", "uv", mise.Latest); err != nil {
		return err
	}

	_, err := mise.Add(ctx, "install-python", "python", ctx.String("python_version"))

	return err
}

func (Module) Configure(ctx *modules.Context) error {
	return shell.EnsureBlock(ctx, "write-shell-env", ID, block())
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-python", func() (modules.Outcome, error) {
		before := mise.Installed(ctx)

		if err := mise.Upgrade(ctx, tools...); err != nil {
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

// The virtualenvs and the uv cache belong to the client's projects; only what this module installed goes.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := shell.RemoveBlock(ctx, "remove-shell-env", ID); err != nil {
		return err
	}

	for _, tool := range tools {
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

func describe(installed map[string]string) string {
	var parts []string
	for _, tool := range tools {
		if installed[tool] != "" {
			parts = append(parts, tool+" "+installed[tool])
		}
	}

	return strings.Join(parts, " · ")
}

// uv resolves against the interpreter mise already put on PATH instead of downloading a second one of its own.
func block() []byte {
	return []byte(shell.PathLines(shell.LocalBin, shell.MiseShims) + "export UV_PYTHON_PREFERENCE=system\n")
}
