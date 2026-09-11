package devcli

import (
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"syscall"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys"
)

const sudo = "sudo"

// Elevation re-runs the grammar as root when the account that typed it cannot
// read the files the answer depends on.
//
// The verbs are handled by the same server the app talks to, and that server
// resolves the entitlement from the server token and the entitlement cache —
// both 0600 root, in a 0700 root folder. Read from `dev`, the account hardening
// leaves open, they are unreadable, the machine reads as unenrolled, and every
// verb but hello, ping, diag and enrol comes back `entitlement_required`. The
// app already answers this by running `sudo -n pupitred serve`; a human and an
// AI agent type `dev`, so the command does it for them.
type Elevation struct {
	Sys        sys.Sys
	State      []string
	Euid       func() int
	Executable func() (string, error)
	LookPath   func(string) (string, error)
	Exec       func(path string, argv, env []string) error
}

func RealElevation(machine sys.Sys, state ...string) Elevation {
	return Elevation{
		Sys:        machine,
		State:      state,
		Euid:       os.Geteuid,
		Executable: os.Executable,
		LookPath:   exec.LookPath,
		Exec:       syscall.Exec,
	}
}

// Run replaces this process when the machine has to be read as root, returns
// nothing to do when it does not, and refuses in so many words when the
// account holds no sudo it can use without a password.
func (e Elevation) Run(args []string) error {
	if e.Euid() == 0 || !e.sealed() {
		return nil
	}

	binary, err := e.Executable()
	if err != nil {
		return protocol.NewError(contract.ErrorInternal, i18n.T("devcli.elevate.binary", err.Error()))
	}

	path, err := e.LookPath(sudo)
	if err != nil {
		return e.refuse("devcli.elevate.root.fix")
	}

	if _, err := e.Sys.Run(sys.Command{Argv: []string{path, "-n", "true"}}); err != nil {
		return e.refuse("devcli.elevate.password.fix")
	}

	return e.Exec(path, append([]string{sudo, "-n", binary, Command}, args...), os.Environ())
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

func (e Elevation) refuse(fix string) error {
	return protocol.NewError(contract.ErrorEntitlementRequired, i18n.T("devcli.elevate.required")).
		WithFix(i18n.T(fix))
}
