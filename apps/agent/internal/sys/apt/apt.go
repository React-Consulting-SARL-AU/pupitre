package apt

import (
	"errors"
	"fmt"
	"io/fs"
	"strings"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/sys"
)

var options = []string{"-o", "DPkg::Lock::Timeout=600", "-o", "Dpkg::Use-Pty=0"}

var environment = []string{"DEBIAN_FRONTEND=noninteractive"}

const updateOnce = "apt-update"

func Installed(ctx sys.Context, pkg string) bool {
	out, err := ctx.Sys().Run(sys.Command{Argv: []string{"dpkg-query", "-W", "-f=${Status}", pkg}})

	return err == nil && strings.Contains(out.Stdout, "install ok installed")
}

func Missing(ctx sys.Context, pkgs ...string) []string {
	var missing []string
	for _, pkg := range pkgs {
		if !Installed(ctx, pkg) {
			missing = append(missing, pkg)
		}
	}

	return missing
}

func Version(ctx sys.Context, pkg string) (string, error) {
	out, err := ctx.Sys().Run(sys.Command{Argv: []string{"dpkg-query", "-W", "-f=${Version}", pkg}})
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(out.Stdout), nil
}

func Update(ctx sys.Context) error {
	return ctx.Once(updateOnce, func() error {
		return Refresh(ctx)
	})
}

// A module that has just added a repository reads the lists again, even when another module already updated them.
func Refresh(ctx sys.Context) error {
	_, err := sys.Exec(ctx, command("update", "-qq"))

	return err
}

// RefreshAdded reads the lists after a repository was added, and takes that repository back out if apt cannot read it: a list left broken fails every later update on the machine, whichever module runs it.
func RefreshAdded(ctx sys.Context, source string, keyrings ...string) error {
	err := Refresh(ctx)
	if err == nil {
		return nil
	}

	for _, path := range append([]string{source}, keyrings...) {
		if removeErr := ctx.Sys().Remove(path); removeErr != nil && !errors.Is(removeErr, fs.ErrNotExist) {
			return errors.Join(err, removeErr)
		}
	}

	return fmt.Errorf("%w\n%s", err, i18n.T("apt.repository.dropped", source))
}

func Install(ctx sys.Context, pkgs ...string) error {
	if err := Update(ctx); err != nil {
		return err
	}

	_, err := sys.Exec(ctx, command("install", append([]string{"-y", "-qq"}, pkgs...)...))

	return err
}

func Fix(ctx sys.Context) error {
	if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"dpkg", "--configure", "-a"}}); err != nil {
		return err
	}

	_, err := sys.Exec(ctx, command("install", "-f", "-y", "-qq"))

	return err
}

func Remove(ctx sys.Context, pkgs ...string) error {
	_, err := sys.Exec(ctx, command("remove", append([]string{"-y", "-qq"}, pkgs...)...))

	return err
}

func Upgrade(ctx sys.Context, pkg string) (bool, error) {
	before, err := Version(ctx, pkg)
	if err != nil {
		return false, err
	}

	if err := Update(ctx); err != nil {
		return false, err
	}

	if _, err := sys.Exec(ctx, command("install", "--only-upgrade", "-y", "-qq", pkg)); err != nil {
		return false, err
	}

	after, err := Version(ctx, pkg)
	if err != nil {
		return false, err
	}

	return after != before, nil
}

func command(action string, args ...string) sys.Command {
	argv := append([]string{"apt-get"}, options...)
	argv = append(argv, action)
	argv = append(argv, args...)

	return sys.Command{Argv: argv, Env: environment}
}
