package claude

import (
	"encoding/json"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/ai/agents"
	"pupitre.studio/agent/internal/modules/login"
)

const (
	Program = "claude"

	configDir = agents.Home + "/.claude"
)

var target = agents.Target{ConfigDir: configDir, ContextFile: "CLAUDE.md", Skills: true, Subagents: true}

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
		Configured: agents.Configured(ctx, target),
		Version:    version,
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return installCLI(ctx)
}

// Nothing to sign in: Claude Code prints its own connection URL on first launch, and the app relays it to the client's browser.
func (Module) Configure(ctx *modules.Context) error {
	return agents.Deploy(ctx, target)
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := upgradeCLI(ctx); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The conversations, the credentials and the skills the client added himself stay: only the CLI and the context this module wrote go.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := removeCLI(ctx); err != nil {
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
	LoggedIn bool   `json:"loggedIn"`
	Email    string `json:"email"`
	OrgName  string `json:"orgName"`
}

// claude auth status reads what ~/.claude holds and prints its JSON signed in or not; it never reaches Anthropic.
func (Module) Login(ctx *modules.Context) (contract.Login, bool) {
	out, _ := login.Ask(ctx, nil, Program, "auth", "status")

	var status authStatus
	if err := json.Unmarshal([]byte(out.Stdout), &status); err != nil {
		return login.Unknown(i18n.T("login.unanswered", "Claude Code", Program+" auth status"))
	}

	if !status.LoggedIn {
		return login.SignedOut(i18n.T("login.claude.fix"))
	}

	if status.Email != "" {
		return login.SignedIn(status.Email)
	}

	return login.SignedIn(status.OrgName)
}
