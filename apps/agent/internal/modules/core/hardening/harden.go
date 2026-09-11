package hardening

import (
	"bytes"
	"errors"
	"io/fs"

	"pupitre.studio/agent/internal/i18n"

	"pupitre.studio/agent/internal/keys"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
	"pupitre.studio/agent/internal/sys/user"
)

type Result struct {
	RootClosed bool   `json:"root_closed"`
	RootKept   bool   `json:"root_kept"`
	NextUser   string `json:"next_user"`
	Reason     string `json:"reason,omitempty"`
}

func rootStays(reason string) Result {
	return Result{NextUser: "root", Reason: reason}
}

// Root kept is a choice, not a failure: the fragment went in, and it left root a way back by key.
func hardened(keepRoot bool, name string) Result {
	return Result{RootClosed: !keepRoot, RootKept: keepRoot, NextUser: name}
}

// Root closes last, and only once a key opens the next user; any failure after the fragment is written puts the previous configuration back.
func Harden(ctx *modules.Context, name string) Result {
	keepRoot := options(ctx).KeepRoot

	reason, err := checkAuthorizedKeys(ctx, name)
	if err != nil {
		return rootStays(err.Error())
	}
	if reason != "" {
		return rootStays(reason)
	}

	previous, changed, err := writeFragment(ctx)
	if err != nil {
		return rootStays(err.Error())
	}
	if !changed {
		return hardened(keepRoot, name)
	}

	if err := ctx.Step("validate-sshd-config", func() (modules.Outcome, error) {
		_, err := sys.Exec(ctx, sys.Command{Argv: []string{"sshd", "-t"}})
		if err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	}); err != nil {
		revertFragment(ctx, previous)
		return rootStays(i18n.T("harden.sshd.invalid", message(err)))
	}

	if err := ctx.Step("reload-sshd", func() (modules.Outcome, error) {
		return modules.Done, reloadSSHD(ctx)
	}); err != nil {
		revertFragment(ctx, previous)
		return rootStays(restoreSSHD(ctx, message(err)))
	}

	return hardened(keepRoot, name)
}

// The previous fragment is back on disk, but sshd still runs on the refused one until it reloads again; that second reload is best effort, and its outcome is what the reader is told.
func restoreSSHD(ctx *modules.Context, cause string) string {
	var again error

	_ = ctx.Step("restore-sshd", func() (modules.Outcome, error) {
		if again = reloadSSHD(ctx); again != nil {
			ctx.Warn(i18n.T("harden.sshd.unrestored", again.Error()))
		}

		return modules.Done, nil
	})

	if again != nil {
		return i18n.T("harden.sshd.reload.unrestored", cause, again.Error())
	}

	return i18n.T("harden.sshd.reload.failed", cause)
}

func checkAuthorizedKeys(ctx *modules.Context, name string) (string, error) {
	path := user.Home(name) + "/.ssh/authorized_keys"
	var reason string

	err := ctx.Step("check-authorized-keys", func() (modules.Outcome, error) {
		if !user.Exists(ctx, name) {
			reason = i18n.T("harden.user.missing", name)
			return modules.Done, nil
		}

		raw, err := file.Read(ctx, path)
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			return modules.Failed, err
		}

		if len(bytes.TrimSpace(raw)) == 0 {
			reason = i18n.T("harden.keys.none", path)
			return modules.Done, nil
		}

		parsed := keys.Parse(raw)
		for _, line := range parsed.Malformed {
			ctx.Logf("%s: line %d unreadable, ignored", path, line)
		}

		if len(parsed.Keys) == 0 {
			reason = i18n.T("harden.keys.malformed", path, len(parsed.Malformed))
			return modules.Done, nil
		}

		ctx.Logf("%d key(s) open %s", len(parsed.Keys), name)

		return modules.Done, nil
	})

	return reason, err
}

func writeFragment(ctx *modules.Context) (previous []byte, changed bool, err error) {
	err = ctx.Step("write-sshd-fragment", func() (modules.Outcome, error) {
		content := preparedFragment(ctx)
		if file.Same(ctx, FragmentPath, content) {
			return modules.Skipped, nil
		}

		current, err := file.Read(ctx, FragmentPath)
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			return modules.Failed, err
		}

		previous = current
		changed = true

		return modules.Done, file.WriteAtomic(ctx, FragmentPath, content, 0o644)
	})

	return previous, changed, err
}

func preparedFragment(ctx *modules.Context) []byte {
	if content, err := file.Read(ctx, PreparedPath); err == nil && len(bytes.TrimSpace(content)) > 0 {
		return content
	}

	return Fragment(options(ctx))
}

func revertFragment(ctx *modules.Context, previous []byte) {
	_ = ctx.Step("revert-sshd-fragment", func() (modules.Outcome, error) {
		if previous == nil {
			_, err := file.Remove(ctx, FragmentPath)
			return modules.Done, err
		}

		return modules.Done, file.WriteAtomic(ctx, FragmentPath, previous, 0o644)
	})
}

// Ubuntu 22.10+ activates sshd through ssh.socket, whose ports come from a generator run at daemon-reload; the socket and the service restart together, existing sessions survive (KillMode=process).
func reloadSSHD(ctx *modules.Context) error {
	if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"systemctl", "daemon-reload"}}); err != nil {
		return err
	}

	if systemd.Active(ctx, "ssh.socket") {
		_, err := sys.Exec(ctx, sys.Command{Argv: []string{"systemctl", "restart", "ssh.socket", "ssh.service"}})
		return err
	}

	if err := systemd.Reload(ctx, "ssh"); err != nil {
		return systemd.Reload(ctx, "sshd")
	}

	return nil
}

func message(err error) string {
	var step *modules.StepError
	if errors.As(err, &step) {
		return step.Message
	}

	return err.Error()
}
