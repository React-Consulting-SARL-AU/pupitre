package stripe

import (
	"encoding/json"
	"runtime"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/download"
	"pupitre.studio/agent/internal/modules/login"
	"pupitre.studio/agent/internal/modules/tool/token"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	Program = "stripe"

	BinPath = "/usr/local/bin/" + Program

	// The variable the CLI reads on its own: no stripe login is needed once it is in the shell.
	keyKey = "STRIPE_API_KEY"
)

// Stripe publishes its CLI as a Go binary per platform, with one checksum document per system.
var release = download.GitHubRelease{
	Repo:      "stripe/stripe-cli",
	Program:   Program,
	Checksums: "stripe-linux-checksums.txt",
	Asset: func(version string) string {
		return Program + "_" + version + "_linux_" + platform() + ".tar.gz"
	},
}

func platform() string {
	if runtime.GOARCH == "arm64" {
		return "arm64"
	}

	return "x86_64"
}

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !file.Exists(ctx, BinPath) {
		return modules.Status{}, nil
	}

	_, stored, err := env.Get(ctx, keyKey)
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{Installed: true, Configured: stored, Version: download.Recorded(ctx, ID)}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return release.InstallStep(ctx, ID, BinPath)
}

func (Module) Configure(ctx *modules.Context) error {
	if err := token.Store(ctx, "store-key", keyKey, ctx.Secret("api_key")); err != nil {
		return err
	}

	return token.Export(ctx, "export-key", keyKey, ctx.Secret("api_key"))
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := release.UpgradeStep(ctx, ID, BinPath); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The Stripe account belongs to the client: uninstalling gives back the machine and its variable, never a webhook or a customer.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := release.RemoveStep(ctx, ID, BinPath); err != nil {
		return err
	}

	return token.Forget(ctx, "forget-key", keyKey)
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

	status.Credentials = map[string]string{i18n.T("module.tool.stripe.api_key.label"): keyKey}

	return status, nil
}

type account struct {
	ID       string `json:"id"`
	Settings struct {
		Dashboard struct {
			DisplayName string `json:"display_name"`
		} `json:"dashboard"`
	} `json:"settings"`
}

// stripe get /v1/account is asked with the key the machine holds; the account answers with the name its dashboard shows, or its identifier.
func (Module) Login(ctx *modules.Context) (contract.Login, bool) {
	held, _, _ := env.Get(ctx, keyKey)
	if held == "" {
		return login.SignedOut(i18n.T("login.token.absent", "Stripe"))
	}

	out, err := login.Ask(ctx, []string{keyKey + "=" + held}, Program, "get", "/v1/account")

	var opened account
	if err != nil || json.Unmarshal([]byte(out.Stdout), &opened) != nil || opened.ID == "" {
		return login.Unknown(i18n.T("login.token.refused", "Stripe"))
	}

	if opened.Settings.Dashboard.DisplayName != "" {
		return login.SignedIn(opened.Settings.Dashboard.DisplayName)
	}

	return login.SignedIn(opened.ID)
}
