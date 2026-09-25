package hardening

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sudo"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	shadowPath = "/etc/shadow"
	// sudo skips sudoers.d names holding a dot, so the candidate is checked there without being read as a rule.
	sudoCandidatePath = "/etc/sudoers.d/.90-dev.pupitre"
)

var sshPasswordKeys = []string{"passwordauthentication", "kbdinteractiveauthentication", "challengeresponseauthentication"}

type SudoResult struct {
	Sudo contract.SudoState `json:"sudo"`
}

// Password before rule: a rule asking for a password dev does not hold would lock the client out of sudo.
func SetSudoPassword(ctx *modules.Context, name, hash string) (SudoResult, error) {
	ctx.Hide(hash)

	if err := refuseSSHPasswords(ctx, name); err != nil {
		return SudoResult{}, err
	}

	if err := checkAgentBinary(ctx); err != nil {
		return SudoResult{}, err
	}

	if err := writePassword(ctx, name, hash); err != nil {
		return SudoResult{}, sudoFailed(err)
	}

	if err := restrictSudo(ctx); err != nil {
		return SudoResult{}, sudoFailed(err)
	}

	return SudoResult{Sudo: contract.SudoPassword}, nil
}

func sudoPasswordHash(line json.RawMessage) (string, *protocol.Error) {
	value, err := contract.Decode(line)
	if err == nil {
		err = contract.Validate("HardenSudoSecrets", value)
	}

	if err != nil {
		return "", protocol.NewError(contract.ErrorBadRequest, i18n.T("harden.sudo.hash.invalid", err.Error())).
			WithFix(i18n.T("harden.sudo.hash.invalid.fix"))
	}

	var secrets struct {
		PasswordHash string `json:"password_hash"`
	}

	if err := json.Unmarshal(line, &secrets); err != nil {
		return "", protocol.NewError(contract.ErrorInternal, i18n.T("secrets.unreadable", err.Error()))
	}

	return secrets.PasswordHash, nil
}

// A password for dev on an SSH server that still takes passwords would be a way in from anywhere.
func refuseSSHPasswords(ctx *modules.Context, name string) error {
	var open []string

	err := ctx.Step("check-sshd-passwords", func() (modules.Outcome, error) {
		out, err := sys.Exec(ctx, sys.Command{Argv: []string{"sshd", "-T", "-C", "user=" + name}})
		if err != nil {
			return modules.Failed, err
		}

		effective := effectiveConfig(out.Stdout)

		for _, key := range sshPasswordKeys {
			values, set := effective[key]
			if (set || key == "passwordauthentication") && strings.Join(values, " ") != "no" {
				open = append(open, key)
			}
		}

		if len(open) > 0 {
			return modules.Failed, errors.New(i18n.T("harden.sudo.ssh.passwords", name, strings.Join(open, ", ")))
		}

		return modules.Done, nil
	})

	if len(open) > 0 {
		return protocol.NewError(contract.ErrorBadRequest, i18n.T("harden.sudo.ssh.passwords", name, strings.Join(open, ", "))).
			WithFix(i18n.T("harden.sudo.ssh.passwords.fix"))
	}

	if err != nil {
		return sudoFailed(err)
	}

	return nil
}

// dev runs this binary as root without a password, so root must own it and every folder above, unwritable by others.
func checkAgentBinary(ctx *modules.Context) error {
	var unsafe string

	err := ctx.Step("check-agent-binary", func() (modules.Outcome, error) {
		unsafe = unsafeBinary(ctx, sudo.Binary)
		if unsafe != "" {
			return modules.Failed, errors.New(i18n.T("harden.sudo.binary.unsafe", unsafe))
		}

		return modules.Done, nil
	})

	if unsafe != "" {
		return protocol.NewError(contract.ErrorInternal, i18n.T("harden.sudo.binary.unsafe", unsafe)).
			WithFix(i18n.T("harden.sudo.binary.unsafe.fix"))
	}

	if err != nil {
		return sudoFailed(err)
	}

	return nil
}

func unsafeBinary(ctx *modules.Context, binary string) string {
	for path := binary; path != "/"; path = filepath.Dir(path) {
		node, found := entryOf(ctx, path)
		if !found {
			return i18n.T("harden.sudo.binary.missing", path)
		}

		if node.Kind == sys.NodeLink {
			return i18n.T("harden.sudo.binary.link", path)
		}

		if owner, err := file.Owner(ctx, path); err != nil || owner != "root" {
			return i18n.T("harden.sudo.binary.owner", path, owner)
		}

		if node.Mode.Perm()&0o022 != 0 {
			return i18n.T("harden.sudo.binary.writable", path, node.Mode.Perm())
		}
	}

	return ""
}

// Listed from its folder so a link reads as a link, never as its target.
func entryOf(ctx *modules.Context, path string) (sys.Node, bool) {
	nodes, err := ctx.Sys().ListIn(filepath.Dir(path), ".")
	if err != nil {
		return sys.Node{}, false
	}

	for _, node := range nodes {
		if node.Name == filepath.Base(path) {
			return node, true
		}
	}

	return sys.Node{}, false
}

func writePassword(ctx *modules.Context, name, hash string) error {
	return ctx.Step("set-password", func() (modules.Outcome, error) {
		if heldHash(ctx, name) == hash {
			return modules.Skipped, nil
		}

		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"chpasswd", "-e"}, Stdin: []byte(name + ":" + hash + "\n")}); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	})
}

func heldHash(ctx *modules.Context, name string) string {
	raw, err := file.Read(ctx, shadowPath)
	if err != nil {
		return ""
	}

	for _, line := range strings.Split(string(raw), "\n") {
		fields := strings.Split(line, ":")
		if len(fields) > 1 && fields[0] == name {
			return fields[1]
		}
	}

	return ""
}

func restrictSudo(ctx *modules.Context) error {
	return ctx.Step("restrict-sudo", func() (modules.Outcome, error) {
		if file.Same(ctx, sudo.Path, []byte(sudo.Restricted)) {
			return modules.Skipped, nil
		}

		defer file.Remove(ctx, sudoCandidatePath)

		if err := file.WriteAtomic(ctx, sudoCandidatePath, []byte(sudo.Restricted), 0o440); err != nil {
			return modules.Failed, err
		}

		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"visudo", "-c", "-f", sudoCandidatePath}}); err != nil {
			return modules.Failed, err
		}

		return modules.Done, file.WriteAtomic(ctx, sudo.Path, []byte(sudo.Restricted), 0o440)
	})
}

func sudoFailed(err error) error {
	return protocol.NewError(contract.ErrorInternal, i18n.T("harden.sudo.failed", message(err))).
		WithFix(i18n.T("harden.sudo.failed.fix"))
}
