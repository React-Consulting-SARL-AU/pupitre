package ruby

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys/apt"
)

// ruby-build compiles the interpreter: these are the headers it looks for, and their names are the same on 22.04 and 24.04.
var buildDependencies = []string{
	"build-essential", "autoconf", "patch", "pkg-config",
	"libssl-dev", "libyaml-dev", "libreadline-dev", "zlib1g-dev",
	"libgmp-dev", "libncurses-dev", "libffi-dev", "libdb-dev", "uuid-dev",
}

const bundlerBin = "$HOME/.bundle/bin"

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

	held := mise.Ruby.Held(ctx)
	if len(held) == 0 {
		return modules.Status{}, nil
	}

	return modules.Status{
		Installed:  true,
		Configured: shell.HasBlock(ctx, ID),
		Version:    mise.Ruby.Describe(ctx),
		Versions:   held,
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	if err := ctx.Step("install-build-dependencies", func() (modules.Outcome, error) {
		missing := apt.Missing(ctx, buildDependencies...)
		if len(missing) == 0 {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Install(ctx, missing...)
	}); err != nil {
		return err
	}

	if err := mise.Ensure(ctx); err != nil {
		return err
	}

	added, err := mise.Ruby.Install(ctx)
	if err != nil {
		return err
	}

	// Bundler ships with each interpreter, so it is only refreshed under the ones that have just landed.
	return ctx.Step("install-bundler", func() (modules.Outcome, error) {
		if !ctx.Bool("bundler") || len(added) == 0 {
			return modules.Skipped, nil
		}

		for _, major := range added {
			if err := mise.Exec(ctx, "ruby", mise.Ruby.Spec(major), "gem", "install", "bundler", "--no-document"); err != nil {
				ctx.Warn(i18n.T("warn.ruby.bundler.failed", err.Error()))
			}
		}

		return modules.Done, nil
	})
}

func (Module) Configure(ctx *modules.Context) error {
	return shell.EnsureBlock(ctx, "write-shell-env", ID, block())
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := mise.Ruby.Upgrade(ctx); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The gems the client installed live under the interpreter mise removes; nothing else of theirs is touched.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := shell.RemoveBlock(ctx, "remove-shell-env", ID); err != nil {
		return err
	}

	return mise.Ruby.Uninstall(ctx)
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
	return []byte(shell.PathLines(shell.LocalBin, shell.MiseShims, bundlerBin) + shell.Export("BUNDLE_PATH__SYSTEM", "true"))
}
