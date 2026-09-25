package devcli

import (
	"errors"
	"io/fs"
	"os"
	"os/exec"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys"
)

const sudo = "sudo"

// Elevation hands the verbs to a server that runs as root when the account
// that typed them cannot read the files the answer depends on.
//
// The server resolves the entitlement from the server token and the
// entitlement cache — both 0600 root, in a 0700 root folder. Read from `dev`,
// the account hardening leaves open, they are unreadable, the machine reads as
// unenrolled, and every verb but hello, ping, diag and enrol comes back
// `entitlement_required`. The app answers this by speaking to `sudo -n
// pupitred serve`; a human and an AI agent type `dev`, so the command does the
// same, and a verb the contract keeps for the privileged session asks sudo for
// the password on the terminal (decision 0015).
type Elevation struct {
	Sys      sys.Sys
	State    []string
	Euid     func() int
	LookPath func(string) (string, error)
	Launch   Launch
}

func RealElevation(machine sys.Sys, state ...string) Elevation {
	return Elevation{
		Sys:      machine,
		State:    state,
		Euid:     os.Geteuid,
		LookPath: exec.LookPath,
		Launch:   LaunchSudo,
	}
}

// Caller answers the server in this process when this account reads the machine as root would, and the one sudo runs otherwise.
func (e Elevation) Caller(local func() Caller, version string) (Caller, error) {
	if e.Euid() == 0 || !e.sealed() {
		return local(), nil
	}

	path, err := e.LookPath(sudo)
	if err != nil {
		return nil, protocol.NewError(contract.ErrorEntitlementRequired, i18n.T("devcli.elevate.required")).
			WithFix(i18n.T("devcli.elevate.root.fix"))
	}

	return &Remote{Sudo: path, Version: version, Launch: e.Launch}, nil
}

// A file that is simply absent is a machine nobody enrolled: root would read no
// more than this account does, and the restricted answer is the true one. A
// file that refuses to open is that same machine, seen from the wrong account.
func (e Elevation) sealed() bool {
	for _, path := range e.State {
		if _, err := e.Sys.ReadFile(path); errors.Is(err, fs.ErrPermission) {
			return true
		}
	}

	return false
}
