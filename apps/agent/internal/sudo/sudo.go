package sudo

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/sys"
)

const (
	Path   = "/etc/sudoers.d/90-dev"
	User   = "dev"
	Binary = "/usr/local/bin/pupitred"
)

// The pre-0015 rule, kept until the client accepts a password.
const Open = User + " ALL=(ALL) NOPASSWD:ALL\n"

// sudo applies the last match and argument lists match exactly (no wildcard): only these two lines skip the password.
const Restricted = User + " ALL=(ALL:ALL) ALL\n" +
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
