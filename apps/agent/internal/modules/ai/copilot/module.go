package copilot

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/ai/agents"
	"pupitre.studio/agent/internal/modules/runtime/mise"
)

const (
	Program = "copilot"

	tool      = "npm:@github/copilot"
	configDir = agents.Home + "/.copilot"
)

var (
	cli = mise.CLI{Tool: tool, Program: Program}

	target = agents.Target{ConfigDir: configDir, ContextFile: "copilot-instructions.md", Skills: true}
)

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !cli.Present(ctx) {
		return modules.Status{}, nil
	}

	return modules.Status{
		Installed:  true,
		Configured: agents.Configured(ctx, target),
		Version:    cli.Version(ctx),
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return cli.Install(ctx)
}

// Nothing to sign in, and no account to report: copilot login uses the device code on a remote terminal, and the CLI has no command that says who holds the session without spending a request.
func (Module) Configure(ctx *modules.Context) error {
	return agents.Deploy(ctx, target)
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := cli.Upgrade(ctx); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The conversations, the credentials and the skills the client added himself stay: only the CLI and the context this module wrote go.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := cli.Remove(ctx); err != nil {
		return err
	}

	return agents.Forget(ctx, target)
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
