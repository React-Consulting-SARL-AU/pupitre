package supabase

import (
	"encoding/json"
	"runtime"
	"strings"

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
	Program = "supabase"

	BinPath = "/usr/local/bin/" + Program

	// The variable the CLI reads on its own: no supabase login is needed once it is in the shell.
	tokenKey = "SUPABASE_ACCESS_TOKEN"
)

// Supabase publishes its CLI as a Go binary per platform, with the checksums beside it.
var release = download.GitHubRelease{
	Repo:      "supabase/cli",
	Program:   Program,
	Checksums: "checksums.txt",
	Asset: func(version string) string {
		return Program + "_" + version + "_linux_" + platform() + ".tar.gz"
	},
}

func platform() string {
	if runtime.GOARCH == "arm64" {
		return "arm64"
	}

	return "amd64"
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

	_, stored, err := env.Get(ctx, tokenKey)
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{Installed: true, Configured: stored, Version: download.Recorded(ctx, ID)}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return release.InstallStep(ctx, ID, BinPath)
}

func (Module) Configure(ctx *modules.Context) error {
	if err := token.Store(ctx, "store-token", tokenKey, ctx.Secret("access_token")); err != nil {
		return err
	}

	return token.Export(ctx, "export-token", tokenKey, ctx.Secret("access_token"))
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := release.UpgradeStep(ctx, ID, BinPath); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The Supabase account belongs to the client: uninstalling gives back the machine and its variable, never a project.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := release.RemoveStep(ctx, ID, BinPath); err != nil {
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

	status.Credentials = map[string]string{i18n.T("module.tool.supabase.access_token.label"): tokenKey}

	return status, nil
}

// supabase orgs list is asked with the token the machine holds; the organisations it opens stand for the account, which the CLI never names.
func (Module) Login(ctx *modules.Context) (contract.Login, bool) {
	held, _, _ := env.Get(ctx, tokenKey)
	if held == "" {
		return login.SignedOut(i18n.T("login.token.absent", "Supabase"))
	}

	out, err := login.Ask(ctx, []string{tokenKey + "=" + held}, Program, "orgs", "list", "-o", "json")

	var orgs []struct {
		Name string `json:"name"`
	}
	if err != nil || json.Unmarshal([]byte(out.Stdout), &orgs) != nil {
		return login.Unknown(i18n.T("login.token.refused", "Supabase"))
	}

	names := make([]string, 0, len(orgs))
	for _, org := range orgs {
		if org.Name != "" {
			names = append(names, org.Name)
		}
	}

	return login.SignedIn(strings.Join(names, ", "))
}
