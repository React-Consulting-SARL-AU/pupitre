package sudo

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	Path   = "/etc/sudoers.d/90-dev"
	User   = "dev"
	Binary = "/usr/local/bin/pupitred"

	// sudo skips sudoers.d names holding a dot, so the candidate is checked there without being read as a rule.
	CandidatePath = "/etc/sudoers.d/.90-dev.pupitre"
)

// The pre-0015 rule, kept until the client accepts a password.
const Open = User + " ALL=(ALL) NOPASSWD:ALL\n"

// What dev keeps once the agent is gone: sudo, on the password the hardening gave it.
const Password = User + " ALL=(ALL:ALL) ALL\n"

// sudo applies the last match and argument lists match exactly (no wildcard): only these two lines skip the password.
const Restricted = Password +
	User + " ALL=(root) NOPASSWD: " + Binary + " serve, " + Binary + " binary install\n"

func State(ctx sys.Context) contract.SudoState {
	raw, err := ctx.Sys().ReadFile(Path)
	if err != nil {
		return ""
	}

	switch string(raw) {
	case Restricted:
		return contract.SudoPassword
	case Open:
		return contract.SudoNopasswdAll
	}

	return ""
}

// A sudoers.d file visudo refuses breaks sudo for every account, so the rule lands only once its candidate passes.
func Write(ctx sys.Context, rule string) error {
	defer file.Remove(ctx, CandidatePath)

	if err := file.WriteAtomic(ctx, CandidatePath, []byte(rule), 0o440); err != nil {
		return err
	}

	if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"visudo", "-c", "-f", CandidatePath}}); err != nil {
		return err
	}

	return file.WriteAtomic(ctx, Path, []byte(rule), 0o440)
}
