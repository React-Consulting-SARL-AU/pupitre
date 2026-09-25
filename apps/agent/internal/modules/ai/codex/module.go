package codex

import (
	"encoding/base64"
	"encoding/json"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/ai/agents"
	"pupitre.studio/agent/internal/modules/login"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	Program = "codex"

	tool      = "npm:@openai/codex"
	configDir = agents.Home + "/.codex"
	authPath  = configDir + "/auth.json"
)

var (
	cli = mise.CLI{Tool: tool, Program: Program}

	target = agents.Target{ConfigDir: configDir, ContextFile: "AGENTS.md", Skills: true}
)

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !cli.Present(ctx) {
		return modules.Status{}, nil
	}

	return modules.Status{
		Installed:  true,
		Configured: agents.Configured(ctx, target),
		Version:    cli.Version(ctx),
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return cli.Install(ctx)
}

// No sign-in step: Codex prints its own connection URL on first launch.
func (Module) Configure(ctx *modules.Context) error {
	return agents.Deploy(ctx, target)
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := cli.Upgrade(ctx); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// Conversations, credentials and the client's own skills stay; only the CLI and our context go.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := cli.Remove(ctx); err != nil {
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

// codex login status exits 1 when signed out and never reaches OpenAI.
func (Module) Login(ctx *modules.Context) (contract.Login, bool) {
	out, err := login.Ask(ctx, nil, Program, "login", "status")
	answer := strings.TrimSpace(out.Stdout + "\n" + out.Stderr)

	switch {
	case err == nil && strings.Contains(answer, "Logged in"):
		return login.SignedIn(account(ctx))
	case strings.Contains(answer, "Not logged in"):
		return login.SignedOut(i18n.T("login.codex.fix"))
	}

	return login.Unknown(i18n.T("login.unanswered", "Codex", Program+" login status"))
}

// The status names no account: the email is in the ChatGPT sign-in's ID token; an API-key session has none.
func account(ctx *modules.Context) string {
	raw, err := file.Read(ctx, authPath)
	if err != nil {
		return ""
	}

	var auth struct {
		Tokens struct {
			IDToken string `json:"id_token"`
		} `json:"tokens"`
	}

	if json.Unmarshal(raw, &auth) != nil {
		return ""
	}

	parts := strings.Split(auth.Tokens.IDToken, ".")
	if len(parts) != 3 {
		return ""
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return ""
	}

	var claims struct {
		Email string `json:"email"`
	}

	if json.Unmarshal(payload, &claims) != nil {
		return ""
	}

	return claims.Email
}
