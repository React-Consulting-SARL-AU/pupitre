package onepassword

import (
	"encoding/json"
	"runtime"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/login"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	pkg     = "1password-cli"
	program = "op"

	keyURL      = "https://downloads.1password.com/linux/keys/1password.asc"
	keyringPath = "/usr/share/keyrings/1password.gpg"
	sourcePath  = "/etc/apt/sources.list.d/1password.list"

	envKey = "OP_SERVICE_ACCOUNT_TOKEN"
)

func sourceLine() string {
	return "deb [arch=" + runtime.GOARCH + " signed-by=" + keyringPath + "] https://downloads.1password.com/linux/debian/" + runtime.GOARCH + " stable main\n"
}

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !apt.Installed(ctx, pkg) {
		return modules.Status{}, nil
	}

	version, err := apt.Version(ctx, pkg)
	if err != nil {
		return modules.Status{}, err
	}

	_, stored, err := env.Get(ctx, envKey)
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{Installed: true, Version: version, Configured: stored}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return ctx.Step("install-op", func() (modules.Outcome, error) {
		if apt.Installed(ctx, pkg) {
			return modules.Skipped, nil
		}

		if err := addRepository(ctx); err != nil {
			return modules.Failed, err
		}

		return modules.Done, apt.Install(ctx, pkg)
	})
}

func addRepository(ctx *modules.Context) error {
	if !file.Exists(ctx, keyringPath) {
		if err := apt.DearmorKey(ctx, keyURL, keyringPath); err != nil {
			return err
		}
	}

	if !file.Same(ctx, sourcePath, []byte(sourceLine())) {
		if err := file.WriteAtomic(ctx, sourcePath, []byte(sourceLine()), 0o644); err != nil {
			return err
		}
	}

	return apt.RefreshAdded(ctx, sourcePath, keyringPath)
}

func (Module) Configure(ctx *modules.Context) error {
	rotated, err := storeToken(ctx)
	if err != nil {
		return err
	}

	if err := exportToken(ctx); err != nil {
		return err
	}

	return verifyAccount(ctx, rotated)
}

func storeToken(ctx *modules.Context) (bool, error) {
	rotated := false

	err := ctx.Step("store-token", func() (modules.Outcome, error) {
		stored, err := env.Set(ctx, envKey, ctx.Secret("service_account_token"))
		if err != nil {
			return modules.Failed, err
		}

		rotated = stored
		if !stored {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})

	return rotated, err
}

// op reads OP_SERVICE_ACCOUNT_TOKEN and nothing else: without it in the dev shell, `op whoami` in a terminal finds no account.
func exportToken(ctx *modules.Context) error {
	return ctx.Step("export-token", func() (modules.Outcome, error) {
		exported, err := shell.SetUserEnv(ctx, envKey, ctx.Secret("service_account_token"))
		if err != nil {
			return modules.Failed, err
		}

		if !exported {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

// Installed is not enough: a token that does not open the vaults makes project.env fail much later, far from its cause.
// A token already verified is not asked again: the round trip to 1Password is only worth a token the machine has not seen.
func verifyAccount(ctx *modules.Context, rotated bool) error {
	return ctx.Step("verify-service-account", func() (modules.Outcome, error) {
		if !rotated {
			return modules.Skipped, nil
		}

		input := user.Input{Env: environment(serviceToken(ctx))}
		if _, err := user.RunWith(ctx, shell.User, input, program, "vault", "list", "--format=json"); err != nil {
			ctx.Warn(i18n.T("warn.onepassword.vault.none"))
		}

		return modules.Done, nil
	})
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-op", func() (modules.Outcome, error) {
		upgraded, err := apt.Upgrade(ctx, pkg)
		if err != nil {
			return modules.Failed, err
		}

		if !upgraded {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The .env.local files produced belong to the projects: uninstalling takes back the CLI and the token, never a project's environment.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := ctx.Step("remove-op", func() (modules.Outcome, error) {
		if !apt.Installed(ctx, pkg) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Remove(ctx, pkg)
	}); err != nil {
		return err
	}

	return ctx.Step("forget-token", func() (modules.Outcome, error) {
		removed, err := env.Unset(ctx, envKey)
		if err != nil {
			return modules.Failed, err
		}

		exported, err := shell.UnsetUserEnv(ctx, envKey)
		if err != nil {
			return modules.Failed, err
		}

		if !(removed || exported) {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
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

	if status.Configured {
		status.Credentials = map[string]string{i18n.T("module.tool.1password.service_account_token.label"): envKey}
	}

	return status, nil
}

func installed(ctx *modules.Context) bool {
	return apt.Installed(ctx, pkg)
}

func serviceToken(ctx *modules.Context) string {
	if secret := ctx.Secret("service_account_token"); secret != "" {
		return secret
	}

	value, _, _ := env.Get(ctx, envKey)

	return value
}

func environment(token string) []string {
	if token == "" {
		return nil
	}

	return []string{envKey + "=" + token}
}

// op whoami answers for the service account the token names; a service account carries no email, so the account it belongs to stands for it.
func (Module) Login(ctx *modules.Context) (contract.Login, bool) {
	token := serviceToken(ctx)
	if token == "" {
		return login.SignedOut(i18n.T("login.token.absent", "1Password"))
	}

	out, err := login.Ask(ctx, environment(token), program, "whoami", "--format=json")

	var who struct {
		URL   string `json:"url"`
		Email string `json:"email"`
	}
	if err != nil || json.Unmarshal([]byte(out.Stdout), &who) != nil {
		return login.Unknown(i18n.T("login.token.refused", "1Password"))
	}

	if who.Email != "" {
		return login.SignedIn(who.Email)
	}

	return login.SignedIn(strings.TrimPrefix(who.URL, "https://"))
}
