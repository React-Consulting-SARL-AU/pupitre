package hardening

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"slices"
	"strings"

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

// Root closes last, and only once a key opens dev; any failure after the fragment is written puts the previous configuration back.
func Harden(ctx *modules.Context) Result {
	name := User
	keepRoot := options(ctx).KeepRoot

	if err := protectLinks(ctx); err != nil {
		return rootStays(message(err))
	}

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

		if again := restoreSSHD(ctx); again != nil {
			return rootStays(i18n.T("harden.sshd.reload.unrestored", message(err), again.Error()))
		}

		return rootStays(i18n.T("harden.sshd.reload.failed", message(err)))
	}

	// sshd -t only proves the files parse: an image whose sshd_config carries no
	// Include reads none of them, and root would be called closed while open.
	if err := confirmSSHD(ctx, keepRoot, name); err != nil {
		revertFragment(ctx, previous)

		if again := restoreSSHD(ctx); again != nil {
			return rootStays(i18n.T("harden.sshd.ignored.unrestored", FragmentPath, message(err), again.Error()))
		}

		return rootStays(i18n.T("harden.sshd.ignored", FragmentPath, message(err)))
	}

	return hardened(keepRoot, name)
}

// The previous fragment is back on disk, but sshd still runs on the refused one until it reloads again; that second reload is best effort, and its outcome is what the reader is told.
func restoreSSHD(ctx *modules.Context) error {
	var again error

	_ = ctx.Step("restore-sshd", func() (modules.Outcome, error) {
		if again = reloadSSHD(ctx); again != nil {
			ctx.Warn(i18n.T("harden.sshd.unrestored", again.Error()))
		}

		return modules.Done, nil
	})

	return again
}

func confirmSSHD(ctx *modules.Context, keepRoot bool, name string) error {
	return ctx.Step("confirm-sshd-config", func() (modules.Outcome, error) {
		out, err := sys.Exec(ctx, sys.Command{Argv: []string{"sshd", "-T", "-C", "user=" + name}})
		if err != nil {
			return modules.Failed, err
		}

		effective := effectiveConfig(out.Stdout)
		rootLogin := "no"
		if keepRoot {
			rootLogin = "prohibit-password"
		}

		if got := rootLoginOf(effective["permitrootlogin"]); got != rootLogin {
			return modules.Failed, fmt.Errorf("permitrootlogin %s", got)
		}

		if !slices.Contains(effective["allowusers"], name) {
			return modules.Failed, fmt.Errorf("allowusers %s", strings.Join(effective["allowusers"], " "))
		}

		return modules.Done, nil
	})
}

// sshd -T prints prohibit-password under the name it had before OpenSSH 7.0.
func rootLoginOf(values []string) string {
	got := strings.Join(values, " ")
	if got == "without-password" {
		return "prohibit-password"
	}

	return got
}

// sshd -T prints one keyword per line, lowercased, a list keyword once per value.
func effectiveConfig(dump string) map[string][]string {
	effective := map[string][]string{}
	for _, line := range strings.Split(dump, "\n") {
		key, value, found := strings.Cut(strings.TrimSpace(line), " ")
		if found {
			effective[key] = append(effective[key], strings.Fields(value)...)
		}
	}

	return effective
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

		if untrusted := untrustedByStrictModes(ctx, name); untrusted != "" {
			reason = i18n.T("harden.keys.untrusted", untrusted, name)
			return modules.Done, nil
		}

		ctx.Logf("%d key(s) open %s", len(parsed.Keys), name)

		return modules.Done, nil
	})

	return reason, err
}

// StrictModes, on by default, makes sshd ignore an authorized_keys whose
// directory or file another user owns or anyone else can write: the key would
// parse here and open nothing once root is closed.
func untrustedByStrictModes(ctx *modules.Context, name string) string {
	home := user.Home(name)

	for _, rel := range []string{".ssh", ".ssh/authorized_keys"} {
		path := home + "/" + rel

		owner, err := file.Owner(ctx, path)
		if err != nil || (owner != name && owner != "root") {
			return path
		}

		node, err := ctx.Sys().StatIn(home, rel)
		if err != nil || node.Mode.Perm()&0o022 != 0 {
			return path
		}
	}

	return ""
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
