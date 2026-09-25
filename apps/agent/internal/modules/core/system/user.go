package system

import (
	"errors"
	"io/fs"
	"strings"

	"pupitre.studio/agent/internal/daemon"
	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/keys"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sudo"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
	"pupitre.studio/agent/internal/sys/user"
)

// A failed timezone only warns: nothing depends on it, and the user must still be created after it.
func setTimezone(ctx *modules.Context) error {
	return ctx.Step("set-timezone", func() (modules.Outcome, error) {
		zone := ctx.String("timezone")
		if file.Same(ctx, timezonePath, []byte(zone+"\n")) {
			return modules.Skipped, nil
		}

		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"timedatectl", "set-timezone", zone}}); err != nil {
			ctx.Warn(i18n.T("warn.system.timezone.failed", zone, err.Error()))

			return modules.Done, nil
		}

		return modules.Done, file.WriteAtomic(ctx, timezonePath, []byte(zone+"\n"), 0o644)
	})
}

func createUser(ctx *modules.Context) error {
	return ctx.Step("create-user", func() (modules.Outcome, error) {
		if !user.Exists(ctx, User) {
			return modules.Done, user.Create(ctx, User, Shell)
		}

		shell, known := loginShell(ctx, User)
		if !known || shell == Shell {
			return modules.Skipped, nil
		}

		_, err := sys.Exec(ctx, sys.Command{Argv: []string{"chsh", "-s", Shell, User}})

		return modules.Done, err
	})
}

func loginShell(ctx *modules.Context, name string) (string, bool) {
	raw, err := file.Read(ctx, passwdPath)
	if err != nil {
		return "", false
	}

	for _, line := range strings.Split(string(raw), "\n") {
		fields := strings.Split(line, ":")
		if len(fields) == 7 && fields[0] == name {
			return fields[6], true
		}
	}

	return "", false
}

// Opens sudo on a new server until a password is set; a server that has one keeps its restricted rule.
func grantSudo(ctx *modules.Context) error {
	return ctx.Step("grant-sudo", func() (modules.Outcome, error) {
		if file.Same(ctx, sudoersPath, []byte(sudo.Restricted)) || file.Same(ctx, sudoersPath, []byte(sudo.Open)) {
			return modules.Skipped, nil
		}

		return modules.Done, file.WriteAtomic(ctx, sudoersPath, []byte(sudo.Open), 0o440)
	})
}

func sudoGranted(ctx *modules.Context) bool {
	return sudo.State(ctx) != ""
}

// A root-owned folder under ~/.local from an earlier run would keep every tool dev installs from installing.
func prepareHome(ctx *modules.Context) error {
	return ctx.Step("prepare-home", func() (modules.Outcome, error) {
		outcome := modules.Skipped

		// useradd leaves a home that was already there to whoever owned it.
		owned, err := file.EnsureOwned(ctx, Home, User, User, 0o750)
		if err != nil {
			return modules.Failed, err
		}

		if owned {
			outcome = modules.Done
		}

		for _, dir := range []string{sshDir, configDir} {
			if file.Exists(ctx, dir) {
				continue
			}

			if err := ownedDir(ctx, dir, 0o700); err != nil {
				return modules.Failed, err
			}

			outcome = modules.Done
		}

		for _, dir := range []string{localDir, localBinDir, localShareDir} {
			changed, err := file.EnsureOwned(ctx, dir, User, User, 0o755)
			if err != nil {
				return modules.Failed, err
			}

			if changed {
				outcome = modules.Done
			}
		}

		return outcome, nil
	})
}

// The app reaches a fresh server as root with the client's key; that key must open dev before harden closes root.
func seedAuthorizedKeys(ctx *modules.Context) error {
	return ctx.Step("seed-authorized-keys", func() (modules.Outcome, error) {
		rootKeys, err := readKeys(ctx, rootKeysPath)
		if err != nil {
			return modules.Failed, err
		}

		current, err := ctx.Sys().ReadFileIn(Home, strings.TrimPrefix(authorizedKeysPath, Home+"/"))
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			return modules.Failed, err
		}

		devKeys := keys.Parse(current)
		content := string(current)
		added := 0

		for _, key := range rootKeys.Keys {
			if key.Restricted() || devKeys.Has(key) {
				continue
			}

			if content != "" && !strings.HasSuffix(content, "\n") {
				content += "\n"
			}

			content += key.Line() + "\n"
			added++
		}

		if added == 0 {
			return modules.Skipped, nil
		}

		ctx.Logf("%d key(s) copied from root for %s", added, User)

		return modules.Done, ownedFile(ctx, authorizedKeysPath, []byte(content), 0o600)
	})
}

func readKeys(ctx *modules.Context, path string) (keys.Parsed, error) {
	raw, err := file.Read(ctx, path)
	if errors.Is(err, fs.ErrNotExist) {
		return keys.Parsed{}, nil
	}

	if err != nil {
		return keys.Parsed{}, err
	}

	return keys.Parse(raw), nil
}

func createProjectsDir(ctx *modules.Context) error {
	return ctx.Step("create-projects-dir", func() (modules.Outcome, error) {
		dir := ctx.String("projects_dir")
		if file.Exists(ctx, dir) {
			return modules.Skipped, nil
		}

		return modules.Done, ownedDir(ctx, dir, 0o755)
	})
}

func setGitIdentity(ctx *modules.Context) error {
	return ctx.Step("set-git-identity", func() (modules.Outcome, error) {
		return ensureOwnedBlock(ctx, gitconfigPath, gitIdentity(ctx.String("git_name"), ctx.String("git_email")))
	})
}

func writeZshrc(ctx *modules.Context) error {
	return ctx.Step("write-zshrc", func() (modules.Outcome, error) {
		if !file.Exists(ctx, zshrcPath) {
			if err := file.WriteAtomic(ctx, zshrcPath, []byte(zshrcBase), 0o644); err != nil {
				return modules.Failed, err
			}
		}

		return ensureOwnedBlock(ctx, zshrcPath, zshrcBlock(ctx.String("projects_dir")))
	})
}

// Bash too: the app's terminal needs the prompt markers whichever shell the client lands in.
func writeBashrc(ctx *modules.Context) error {
	return ctx.Step("write-bashrc", func() (modules.Outcome, error) {
		return ensureOwnedBlock(ctx, bashrcPath, bashrcBlock(ctx.String("projects_dir")))
	})
}

// A link to the agent's own binary: `dev status` works over plain ssh, and nothing readable is laid on disk.
func linkDev(ctx *modules.Context) error {
	return ctx.Step("link-dev-command", func() (modules.Outcome, error) {
		if linked(ctx) {
			return modules.Skipped, nil
		}

		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"ln", "-sfn", devcli.Binary, devcli.Link}}); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	})
}

func unlinkDev(ctx *modules.Context) error {
	return ctx.Step("remove-dev-command", func() (modules.Outcome, error) {
		if !linked(ctx) {
			return modules.Skipped, nil
		}

		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"rm", "-f", devcli.Link}}); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	})
}

func linked(ctx *modules.Context) bool {
	out, err := sys.Exec(ctx, sys.Command{Argv: []string{"readlink", devcli.Link}})

	return err == nil && strings.TrimSpace(out.Stdout) == devcli.Binary
}

func installAgentUnit(ctx *modules.Context) error {
	return ctx.Step("install-agent-unit", func() (modules.Outcome, error) {
		same := file.Same(ctx, daemon.UnitPath, []byte(daemon.UnitFile))
		if same && systemd.Active(ctx, daemon.Unit) {
			return modules.Skipped, nil
		}

		// enable --now leaves a running daemon on the unit it started with.
		replacing := !same && file.Exists(ctx, daemon.UnitPath)

		if err := systemd.WriteUnit(ctx, daemon.Unit, []byte(daemon.UnitFile)); err != nil {
			return modules.Failed, err
		}

		if err := systemd.Enable(ctx, daemon.Unit); err != nil {
			return modules.Failed, err
		}

		if !replacing {
			return modules.Done, nil
		}

		return modules.Done, systemd.Restart(ctx, daemon.Unit)
	})
}

// A oneshot of its own, outside the daemon's sandbox, brings back what was up before a boot.
func installResumeUnit(ctx *modules.Context) error {
	return ctx.Step("install-resume-unit", func() (modules.Outcome, error) {
		if file.Same(ctx, daemon.ResumeUnitPath, []byte(daemon.ResumeUnitFile)) {
			return modules.Skipped, nil
		}

		if err := systemd.WriteUnit(ctx, daemon.ResumeUnit, []byte(daemon.ResumeUnitFile)); err != nil {
			return modules.Failed, err
		}

		return modules.Done, systemd.EnableLater(ctx, daemon.ResumeUnit)
	})
}

func removeResumeUnit(ctx *modules.Context) error {
	return ctx.Step("remove-resume-unit", func() (modules.Outcome, error) {
		if !file.Exists(ctx, daemon.ResumeUnitPath) {
			return modules.Skipped, nil
		}

		if err := systemd.Disable(ctx, daemon.ResumeUnit); err != nil {
			ctx.Warn(i18n.T("warn.system.unit.stop.failed", daemon.ResumeUnit, err.Error()))
		}

		_, err := file.Remove(ctx, daemon.ResumeUnitPath)

		return modules.Done, err
	})
}

func removeAgentUnit(ctx *modules.Context) error {
	return ctx.Step("remove-agent-unit", func() (modules.Outcome, error) {
		if !file.Exists(ctx, daemon.UnitPath) {
			return modules.Skipped, nil
		}

		if err := systemd.Disable(ctx, daemon.Unit); err != nil {
			ctx.Warn(i18n.T("warn.system.unit.stop.failed", daemon.Unit, err.Error()))
		}

		_, err := file.Remove(ctx, daemon.UnitPath)

		return modules.Done, err
	})
}

func writeTmuxConf(ctx *modules.Context) error {
	return ctx.Step("write-tmux-conf", func() (modules.Outcome, error) {
		if file.Exists(ctx, tmuxPath) {
			return modules.Skipped, nil
		}

		return modules.Done, ownedFile(ctx, tmuxPath, []byte(tmuxConf), 0o644)
	})
}

func ensureOwnedBlock(ctx *modules.Context, path string, content []byte) (modules.Outcome, error) {
	changed, err := file.EnsureBlock(ctx, path, ID, content)
	if err != nil {
		return modules.Failed, err
	}

	if !changed {
		return modules.Skipped, nil
	}

	return modules.Done, file.Chown(ctx, path, User, User)
}

func ownedFile(ctx *modules.Context, path string, content []byte, mode uint32) error {
	if err := file.WriteAtomic(ctx, path, content, fsMode(mode)); err != nil {
		return err
	}

	return file.Chown(ctx, path, User, User)
}

func ownedDir(ctx *modules.Context, path string, mode uint32) error {
	return file.MkdirOwned(ctx, path, User, User, fsMode(mode))
}

func fsMode(mode uint32) fs.FileMode {
	return fs.FileMode(mode)
}
