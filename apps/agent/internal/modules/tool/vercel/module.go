package vercel

import (
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/login"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/modules/tool/token"
	"pupitre.studio/agent/internal/sys/env"
)

const (
	Program = "vercel"

	tool = "npm:vercel"

	// The CLI reads it on its own, so no vercel login is needed once it is in the shell.
	tokenKey = "VERCEL_TOKEN"
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
	if err := token.Store(ctx, "store-token", tokenKey, ctx.Secret("token")); err != nil {
		return err
	}

	return token.Export(ctx, "export-token", tokenKey, ctx.Secret("token"))
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

	return token.Forget(ctx, "forget-token", tokenKey)
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

	status.Credentials = map[string]string{i18n.T("module.tool.vercel.token.label"): tokenKey}

	return status, nil
}

func (Module) Login(ctx *modules.Context) (contract.Login, bool) {
	held, _, _ := env.Get(ctx, tokenKey)
	if held == "" {
		return login.SignedOut(i18n.T("login.token.absent", "Vercel"))
	}

	out, err := login.Ask(ctx, []string{tokenKey + "=" + held}, Program, "whoami")

	name := lastLine(out.Stdout)
	if err != nil || name == "" {
		return login.Unknown(i18n.T("login.token.refused", "Vercel"))
	}

	return login.SignedIn(name)
}

func lastLine(output string) string {
	lines := strings.Split(strings.TrimSpace(output), "\n")

	return strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(lines[len(lines)-1]), ">"))
}
