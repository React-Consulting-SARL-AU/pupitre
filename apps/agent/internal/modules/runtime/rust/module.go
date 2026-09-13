package rust

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/modules/runtime/shell"
)

const (
	tool = "rust"

	// Where cargo install puts what it builds; rustup's toolchains sit under mise and answer through its shims.
	cargoBin = "$HOME/.cargo/bin"
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

	installed := mise.Installed(ctx)[tool]
	if installed == "" {
		return modules.Status{}, nil
	}

	return modules.Status{
		Installed:  true,
		Configured: shell.HasBlock(ctx, ID),
		Version:    "rust " + installed,
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	if err := mise.Ensure(ctx); err != nil {
		return err
	}

	_, err := mise.Add(ctx, "install-rust", tool, ctx.String("rust_version"))

	return err
}

func (Module) Configure(ctx *modules.Context) error {
	return shell.EnsureBlock(ctx, "write-shell-env", ID, block())
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-rust", func() (modules.Outcome, error) {
		before := mise.Installed(ctx)[tool]

		if err := mise.Upgrade(ctx, tool); err != nil {
			return modules.Failed, err
		}

		if mise.Installed(ctx)[tool] == before {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The registry cache and whatever cargo install built under ~/.cargo are the client's work, not ours.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := shell.RemoveBlock(ctx, "remove-shell-env", ID); err != nil {
		return err
	}

	return mise.Remove(ctx, "remove-rust", tool)
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

func block() []byte {
	return []byte(shell.PathLines(shell.LocalBin, shell.MiseShims, cargoBin))
}
