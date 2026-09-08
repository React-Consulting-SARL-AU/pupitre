package ssh

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure/routes"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	pkg = "openssh-server"

	// Provider is the one name this module answers to: the marker on disk says the machine is exposed by nothing but the app's own session.
	Provider = "ssh"

	modePath = routes.ModePath
)

var mode = []byte(Provider + "\n")

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !apt.Installed(ctx, pkg) {
		return modules.Status{}, nil
	}

	version, err := apt.Version(ctx, pkg)
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{Installed: true, Version: version, Configured: file.Same(ctx, modePath, mode)}, nil
}

// The only channel the app has is the SSH session it already holds, and the server it runs on already carries sshd.
func (Module) Install(ctx *modules.Context) error {
	return ctx.Step("check-ssh-server", func() (modules.Outcome, error) {
		if apt.Installed(ctx, pkg) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Install(ctx, pkg)
	})
}

func (Module) Configure(ctx *modules.Context) error {
	if err := ctx.Step("declare-mode", func() (modules.Outcome, error) {
		if file.Same(ctx, modePath, mode) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll("/etc/pupitre", 0o700); err != nil {
			return modules.Failed, err
		}

		return modules.Done, file.WriteAtomic(ctx, modePath, mode, 0o644)
	}); err != nil {
		return err
	}

	// Without a domain, project.url answers http://host:port — the only address that really answers here.
	return ctx.Step("clear-domain", func() (modules.Outcome, error) {
		removed, err := env.Unset(ctx, env.DomainKey)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func (m Module) Upgrade(ctx *modules.Context) error {
	return m.Configure(ctx)
}

// sshd belongs to the machine, not to this module: uninstalling takes back the declared mode and nothing else.
func (Module) Uninstall(ctx *modules.Context) error {
	return ctx.Step("remove-mode", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, modePath)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func (m Module) Status(ctx *modules.Context) (modules.Status, error) {
	status, err := m.Check(ctx)
	if err != nil {
		return modules.Status{}, err
	}

	status.State = contract.ServiceStopped
	if status.Configured {
		status.State = contract.ServiceRunning
	}

	return status, nil
}
