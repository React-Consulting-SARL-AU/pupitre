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

// The token and license cache are 0600 root: read from dev the machine looks unenrolled, so verbs go through sudo.
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

func (e Elevation) Caller(local func() Caller, version string) (Caller, error) {
	if e.Euid() == 0 || !e.sealed() {
		return local(), nil
	}

	path, err := e.LookPath(sudo)
	if err != nil {
		return nil, protocol.NewError(contract.ErrorLicenseRequired, i18n.T("devcli.elevate.required")).
			WithFix(i18n.T("devcli.elevate.root.fix"))
	}

	return &Remote{Sudo: path, Version: version, Launch: e.Launch}, nil
}

// An absent file is an unenrolled machine root would read the same way; only a permission refusal calls for root.
func (e Elevation) sealed() bool {
	for _, path := range e.State {
		if _, err := e.Sys.ReadFile(path); errors.Is(err, fs.ErrPermission) {
			return true
		}
	}

	return false
}
