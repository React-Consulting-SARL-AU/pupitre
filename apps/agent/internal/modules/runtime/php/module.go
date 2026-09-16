package php

import (
	"errors"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	iniDir  = shell.Home + "/.config/php/conf.d"
	iniPath = iniDir + "/99-pupitre.ini"

	defaultMemoryLimit = "512M"
)

// mise builds PHP from source: without these headers the build stops halfway, with a compiler error nobody should have to read.
// gd, intl and zlib are always configured, and gd links the system libraries when libpng is present — so libgd-dev, libicu-dev
// and zlib1g-dev are not optional; libpq-dev lets pdo_pgsql build when a database module is on the same machine. A prebuilt
// binary spares an amd64 host the compile, but an arm64 one always builds, which is where their absence surfaces.
var buildDependencies = []string{
	"build-essential", "autoconf", "bison", "re2c", "pkg-config",
	"libxml2-dev", "libsqlite3-dev", "libcurl4-openssl-dev", "libonig-dev",
	"libzip-dev", "libssl-dev", "libreadline-dev",
	"zlib1g-dev", "libgd-dev", "libicu-dev", "libpq-dev",
}

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

	held := mise.PHP.Held(ctx)
	if len(held) == 0 {
		return modules.Status{}, nil
	}

	return modules.Status{
		Installed:  true,
		Configured: shell.HasBlock(ctx, ID),
		Version:    mise.PHP.Describe(ctx),
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

	if _, err := mise.PHP.Install(ctx); err != nil {
		return err
	}

	if !ctx.Bool("composer") {
		return ctx.Step("install-composer", func() (modules.Outcome, error) {
			return modules.Skipped, nil
		})
	}

	// mise dropped composer from its registry, and the php runtime already lays
	// a signature-verified composer beside php with a shim of its own: that is
	// the composer this server runs, so the step confirms it answers rather than
	// trading a second one the registry can no longer name.
	return ctx.Step("install-composer", func() (modules.Outcome, error) {
		if _, err := user.Run(ctx, shell.User, "composer", "--version"); err != nil {
			return modules.Failed, errors.New(i18n.T("modules.php.composer_missing"))
		}

		return modules.Skipped, nil
	})
}

func (Module) Configure(ctx *modules.Context) error {
	if err := ctx.Step("write-php-ini", func() (modules.Outcome, error) {
		content := ini(memoryLimit(ctx))
		if file.Same(ctx, iniPath, content) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(iniDir, 0o755); err != nil {
			return modules.Failed, err
		}

		if err := file.Chown(ctx, iniDir, shell.User, shell.User); err != nil {
			return modules.Failed, err
		}

		if err := file.WriteAtomic(ctx, iniPath, content, 0o644); err != nil {
			return modules.Failed, err
		}

		return modules.Done, file.Chown(ctx, iniPath, shell.User, shell.User)
	}); err != nil {
		return err
	}

	return shell.EnsureBlock(ctx, "write-shell-env", ID, block())
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := mise.PHP.Upgrade(ctx); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The build dependencies stay: they are ordinary Ubuntu packages other things on the machine may already lean on.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := shell.RemoveBlock(ctx, "remove-shell-env", ID); err != nil {
		return err
	}

	if err := ctx.Step("remove-php-ini", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, iniPath)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return mise.PHP.Uninstall(ctx)
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

func memoryLimit(ctx *modules.Context) string {
	chosen := strings.TrimSpace(ctx.String("memory_limit"))
	if chosen == "" {
		return defaultMemoryLimit
	}

	return chosen
}

func ini(limit string) []byte {
	return []byte("memory_limit = " + limit + "\ndate.timezone = UTC\n")
}

// PHP_INI_SCAN_DIR keeps our file additive: the ini mise's build ships stays in place, ours is read after it.
func block() []byte {
	return []byte(shell.PathLines(shell.LocalBin, shell.MiseShims) + shell.Export("PHP_INI_SCAN_DIR", ":"+iniDir))
}
