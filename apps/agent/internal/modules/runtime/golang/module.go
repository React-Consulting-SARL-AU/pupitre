package golang

import (
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/modules/runtime/shell"
)

const defaultGopath = "$HOME/go"

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

	held := mise.Go.Held(ctx)
	if len(held) == 0 {
		return modules.Status{}, nil
	}

	return modules.Status{
		Installed:  true,
		Configured: shell.HasBlock(ctx, ID),
		Version:    mise.Go.Describe(ctx),
		Versions:   held,
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	if err := mise.Ensure(ctx); err != nil {
		return err
	}

	_, err := mise.Go.Install(ctx)

	return err
}

func (Module) Configure(ctx *modules.Context) error {
	return shell.EnsureBlock(ctx, "write-shell-env", ID, block(gopath(ctx)))
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if _, err := mise.Go.Upgrade(ctx); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The module cache and whatever go install put in GOPATH/bin are the client's work, not ours.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := shell.RemoveBlock(ctx, "remove-shell-env", ID); err != nil {
		return err
	}

	return mise.Go.Uninstall(ctx)
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

func gopath(ctx *modules.Context) string {
	chosen := strings.TrimSpace(ctx.String("gopath"))
	if chosen == "" {
		return defaultGopath
	}

	return chosen
}

func block(path string) []byte {
	return []byte(shell.Export("GOPATH", path) + shell.PathLines(shell.LocalBin, shell.MiseShims, path+"/bin"))
}
