package modules

import (
	"fmt"
	"pupitre.studio/agent/internal/i18n"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/protocol"
)

type Module interface {
	Manifest() contract.Manifest
	Check(ctx *Context) (Status, error)
	Install(ctx *Context) error
	Configure(ctx *Context) error
	Upgrade(ctx *Context) error
	Uninstall(ctx *Context) error
	Status(ctx *Context) (Status, error)
}

type Status struct {
	Installed   bool
	Configured  bool
	Version     string
	Upgradable  bool
	State       contract.ServiceState
	Port        int
	Unit        string
	Credentials map[string]string
}

func (s Status) Service(manifest contract.Manifest) contract.ServiceStatus {
	state := s.State
	if state == "" {
		state = contract.ServiceUnknown
	}

	return contract.ServiceStatus{
		ID:          manifest.ID,
		Name:        manifest.Name,
		State:       state,
		Runs:        manifest.Runs,
		Version:     s.Version,
		Port:        s.Port,
		Unit:        s.Unit,
		Credentials: s.Credentials,
	}
}

type Outcome int

const (
	Done Outcome = iota
	Skipped
	Failed
)

type StepError struct {
	Module  string
	Step    string
	Message string
	Replay  string
}

func (e *StepError) Error() string {
	return fmt.Sprintf("%s · %s : %s", e.Module, e.Step, e.Message)
}

func Replay(module string) string {
	return "sudo pupitred install --only=" + module
}

func NotInstalled(id, name string) error {
	return protocol.NewError(contract.ErrorServiceNotFound, i18n.T("module.notInstalled", name)).
		WithFix(i18n.T("module.notInstalled.fix", id))
}
