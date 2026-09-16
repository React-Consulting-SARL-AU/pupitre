package python

import (
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/modules/runtime/shell"
)

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

	held := mise.Python.Held(ctx)
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

	if _, err := mise.Add(ctx, "install-uv", "uv", mise.Latest); err != nil {
		return err
	}

	_, err := mise.Python.Install(ctx)

	return err
}

func (Module) Configure(ctx *modules.Context) error {
	return shell.EnsureBlock(ctx, "write-shell-env", ID, block())
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := mise.Python.Upgrade(ctx); err != nil {
		return err
	}

	if err := ctx.Step("upgrade-uv", func() (modules.Outcome, error) {
		before := mise.Installed(ctx)["uv"]

		if err := mise.Upgrade(ctx, "uv"); err != nil {
			return modules.Failed, err
		}

		if mise.Installed(ctx)["uv"] == before {
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

	if err := mise.Remove(ctx, "remove-uv", "uv"); err != nil {
		return err
	}

	return mise.Python.Uninstall(ctx)
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

func describe(ctx *modules.Context) string {
	parts := []string{mise.Python.Describe(ctx)}
	if uv := mise.Installed(ctx)["uv"]; uv != "" {
		parts = append(parts, "uv "+uv)
	}

	return strings.Join(parts, " · ")
}

// uv resolves against the interpreter mise already put on PATH instead of downloading a second one of its own.
func block() []byte {
	return []byte(shell.PathLines(shell.LocalBin, shell.MiseShims) + "export UV_PYTHON_PREFERENCE=system\n")
}
