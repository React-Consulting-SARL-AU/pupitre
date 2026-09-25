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

// Open is what every server held before decision 0015, and keeps until its client accepts a password.
const Open = User + " ALL=(ALL) NOPASSWD:ALL\n"

// sudo applies the last rule that matches, so pupitred's comes after the one asking for the password. A command listed with
// arguments matches exactly those, and a wildcard would match spaces too: only these two lines run without the password, and
// `serve --privileged`, `binary install --privileged` and every other subcommand fall to the first rule.
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
