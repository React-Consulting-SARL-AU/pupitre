package cursor

import (
	"encoding/json"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/ai/agents"
	"pupitre.studio/agent/internal/modules/login"
	"pupitre.studio/agent/internal/modules/runtime/shell"
)

const (
	// Unambiguous in a process list, where the other linked name, `agent`, could be anything.
	Program = "cursor-agent"

	configDir = agents.Home + "/.cursor"
)

var target = agents.Target{ConfigDir: configDir, Skills: true}

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	version := installedVersion(ctx)
	if version == "" {
		return modules.Status{}, nil
	}

	return modules.Status{
		Installed:  true,
		Configured: shell.HasBlock(ctx, ID) && agents.Configured(ctx, target),
		Version:    version,
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return installCLI(ctx)
}

// ~/.local/bin reaches PATH only through a runtime module, so this one adds it for a machine without any.
func (Module) Configure(ctx *modules.Context) error {
	if err := shell.EnsureBlock(ctx, "write-shell-env", ID, []byte(shell.PathLines(shell.LocalBin))); err != nil {
		return err
	}

	return agents.Deploy(ctx, target)
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := upgradeCLI(ctx); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// Conversations, credentials and the client's own skills stay under ~/.cursor; only the CLI goes.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := removeCLI(ctx); err != nil {
		return err
	}

	if err := shell.RemoveBlock(ctx, "remove-shell-env", ID); err != nil {
		return err
	}

	return agents.Forget(ctx, target)
}

func (m Module) Status(ctx *modules.Context) (modules.Status, error) {
	status, err := m.Check(ctx)
	if err != nil {
		return modules.Status{}, err
	}

	status.State = contract.ServiceUnknown
	if status.Installed {
		status.State = contract.ServiceRunning
	}

	return status, nil
}

type authStatus struct {
	Authenticated bool `json:"isAuthenticated"`
	UserInfo      struct {
		Email string `json:"email"`
	} `json:"userInfo"`
}

func (Module) Login(ctx *modules.Context) (contract.Login, bool) {
	out, _ := login.Ask(ctx, nil, Program, "status", "--format", "json")

	var status authStatus
	if err := json.Unmarshal([]byte(out.Stdout), &status); err != nil {
		return login.Unknown(i18n.T("login.unanswered", "Cursor CLI", Program+" status"))
	}

	if !status.Authenticated {
		return login.SignedOut(i18n.T("login.cursor.fix"))
	}

	return login.SignedIn(status.UserInfo.Email)
}
