package php

import (
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	iniDir  = shell.Home + "/.config/php/conf.d"
	iniPath = iniDir + "/99-pupitre.ini"

	defaultMemoryLimit = "512M"
)

// mise builds PHP from source: without these headers the build stops halfway, with a compiler error nobody should have to read.
var buildDependencies = []string{
	"build-essential", "autoconf", "bison", "re2c", "pkg-config",
	"libxml2-dev", "libsqlite3-dev", "libcurl4-openssl-dev", "libonig-dev",
	"libzip-dev", "libssl-dev", "libreadline-dev",
}

var tools = []string{"php", "composer"}

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
	if installed["php"] == "" {
		return modules.Status{}, nil
	}

	return modules.Status{
		Installed:  true,
		Configured: shell.HasBlock(ctx, ID),
		Version:    describe(installed),
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

	if _, err := mise.Add(ctx, "install-php", "php", ctx.String("php_version")); err != nil {
		return err
	}

	if !ctx.Bool("composer") {
		return ctx.Step("install-composer", func() (modules.Outcome, error) {
			return modules.Skipped, nil
		})
	}

	_, err := mise.Add(ctx, "install-composer", "composer", mise.Latest)

	return err
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
	if err := ctx.Step("upgrade-php", func() (modules.Outcome, error) {
		before := mise.Installed(ctx)

		present := []string{}
		for _, tool := range tools {
			if before[tool] != "" {
				present = append(present, tool)
			}
		}

		if err := mise.Upgrade(ctx, present...); err != nil {
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

func memoryLimit(ctx *modules.Context) string {
	chosen := strings.TrimSpace(ctx.String("memory_limit"))
	if chosen == "" {
		return defaultMemoryLimit
	}

	return chosen
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

func ini(limit string) []byte {
	return []byte("memory_limit = " + limit + "\ndate.timezone = UTC\n")
}

// PHP_INI_SCAN_DIR keeps our file additive: the ini mise's build ships stays in place, ours is read after it.
func block() []byte {
	return []byte(shell.PathLines(shell.LocalBin, shell.MiseShims) + shell.Export("PHP_INI_SCAN_DIR", ":"+iniDir))
}
