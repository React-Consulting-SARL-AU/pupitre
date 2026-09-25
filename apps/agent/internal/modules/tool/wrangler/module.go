package wrangler

import (
	"encoding/json"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/login"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/modules/tool/token"
	"pupitre.studio/agent/internal/sys/env"
)

const (
	Program = "wrangler"

	tool = "npm:wrangler"

	// wrangler reads both on its own and has no token login, so the dev shell must carry them too.
	tokenKey   = "CLOUDFLARE_API_TOKEN"
	accountKey = "CLOUDFLARE_ACCOUNT_ID"
)

var cli = mise.CLI{Tool: tool, Program: Program}

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

	_, stored, err := env.Get(ctx, tokenKey)
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{Installed: true, Configured: stored, Version: cli.Version(ctx)}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return cli.Install(ctx)
}

func (Module) Configure(ctx *modules.Context) error {
	if err := token.Store(ctx, "store-token", tokenKey, ctx.Secret("api_token")); err != nil {
		return err
	}

	if err := token.Store(ctx, "store-account", accountKey, ctx.String("account_id")); err != nil {
		return err
	}

	if err := token.Export(ctx, "export-token", tokenKey, ctx.Secret("api_token")); err != nil {
		return err
	}

	return token.Export(ctx, "export-account", accountKey, ctx.String("account_id"))
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := cli.Upgrade(ctx); err != nil {
		return err
	}

	return m.Configure(ctx)
}

func (Module) Uninstall(ctx *modules.Context) error {
	if err := cli.Remove(ctx); err != nil {
		return err
	}

	return token.Forget(ctx, "forget-token", tokenKey, accountKey)
}

func (m Module) Status(ctx *modules.Context) (modules.Status, error) {
	status, err := m.Check(ctx)
	if err != nil {
		return modules.Status{}, err
	}

	status.State = contract.ServiceStopped
	if status.Installed {
		status.State = contract.ServiceRunning
	}

	status.Credentials = map[string]string{i18n.T("module.tool.wrangler.api_token.label"): tokenKey}

	return status, nil
}

type whoami struct {
	LoggedIn bool   `json:"loggedIn"`
	Email    string `json:"email"`
	Accounts []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"accounts"`
}

// An account-scoped token carries no email, so the account it opens stands for it.
func (Module) Login(ctx *modules.Context) (contract.Login, bool) {
	token, _, _ := env.Get(ctx, tokenKey)
	if token == "" {
		return login.SignedOut(i18n.T("login.token.absent", "Cloudflare"))
	}

	account, _, _ := env.Get(ctx, accountKey)
	variables := []string{tokenKey + "=" + token, accountKey + "=" + account}

	out, err := login.Ask(ctx, variables, Program, "whoami", "--json")

	var who whoami
	if err != nil || json.Unmarshal([]byte(out.Stdout), &who) != nil || !who.LoggedIn {
		return login.Unknown(i18n.T("login.token.refused", "Cloudflare"))
	}

	return login.SignedIn(who.name(account))
}

func (w whoami) name(account string) string {
	if w.Email != "" {
		return w.Email
	}

	for _, held := range w.Accounts {
		if held.ID == account {
			return held.Name
		}
	}

	if len(w.Accounts) > 0 {
		return w.Accounts[0].Name
	}

	return ""
}
