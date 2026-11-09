package infisical

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"runtime"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/download"
	"pupitre.studio/agent/internal/modules/login"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/modules/tool/token"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	Program = "infisical"

	BinPath = "/usr/local/bin/" + Program

	// The CLI's own names: `infisical login --method=universal-auth` reads them with no flag.
	clientIDKey     = "INFISICAL_UNIVERSAL_AUTH_CLIENT_ID"
	clientSecretKey = "INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET"
	domainKey       = "INFISICAL_DOMAIN"
)

var release = download.GitHubRelease{
	Repo:      "Infisical/cli",
	Program:   Program,
	Checksums: "checksums.txt",
	Asset: func(version string) string {
		return "cli_" + version + "_linux_" + runtime.GOARCH + ".tar.gz"
	},
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

	_, stored, err := env.Get(ctx, clientSecretKey)
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{Installed: true, Configured: stored, Version: download.Recorded(ctx, ID)}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return release.InstallStep(ctx, ID, BinPath)
}

func (Module) Configure(ctx *modules.Context) error {
	held := given(ctx)

	rotated, err := storeIdentity(ctx, held)
	if err != nil {
		return err
	}

	if err := exportIdentity(ctx, held); err != nil {
		return err
	}

	return verifyIdentity(ctx, held, rotated)
}

func storeIdentity(ctx *modules.Context, held identity) (bool, error) {
	rotated := false

	err := ctx.Step("store-identity", func() (modules.Outcome, error) {
		for _, variable := range held.variables() {
			stored, err := env.Set(ctx, variable.key, variable.value)
			if err != nil {
				return modules.Failed, err
			}

			rotated = rotated || stored
		}

		if !rotated {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})

	return rotated, err
}

// The CLI takes no access token from these: they let `infisical login --method=universal-auth` in a terminal ask for one with no flag.
func exportIdentity(ctx *modules.Context, held identity) error {
	return ctx.Step("export-identity", func() (modules.Outcome, error) {
		exported := false

		for _, variable := range held.variables() {
			changed, err := shell.SetUserEnv(ctx, variable.key, variable.value)
			if err != nil {
				return modules.Failed, err
			}

			exported = exported || changed
		}

		if !exported {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

// An identity Infisical refuses would fail project.env much later, far from its cause; only a new one is worth the round trip.
func verifyIdentity(ctx *modules.Context, held identity, rotated bool) error {
	return ctx.Step("verify-identity", func() (modules.Outcome, error) {
		if !rotated {
			return modules.Skipped, nil
		}

		if _, err := accessToken(ctx, held); err != nil {
			ctx.Warn(i18n.T("warn.infisical.identity.refused", held.domain))
		}

		return modules.Done, nil
	})
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := release.UpgradeStep(ctx, ID, BinPath); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The .env.local files produced belong to the projects and stay.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := release.RemoveStep(ctx, ID, BinPath); err != nil {
		return err
	}

	return token.Forget(ctx, "forget-identity", clientIDKey, clientSecretKey, domainKey)
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
		status.Credentials = map[string]string{
			i18n.T("module.tool.infisical.client_id.label"):     clientIDKey,
			i18n.T("module.tool.infisical.client_secret.label"): clientSecretKey,
		}
	}

	return status, nil
}

func (Module) Login(ctx *modules.Context) (contract.Login, bool) {
	held := stored(ctx)
	if !held.complete() {
		return login.SignedOut(i18n.T("login.token.absent", "Infisical"))
	}

	out, err := login.Ask(ctx, held.environment(), loginArgv()...)
	if err != nil {
		return login.Unknown(i18n.T("login.token.refused", "Infisical"))
	}

	return login.SignedIn(accountOf(strings.TrimSpace(out.Stdout), held.clientID))
}

type identity struct {
	domain       string
	clientID     string
	clientSecret string
}

type variable struct {
	key   string
	value string
}

func (i identity) variables() []variable {
	return []variable{
		{domainKey, i.domain},
		{clientIDKey, i.clientID},
		{clientSecretKey, i.clientSecret},
	}
}

func (i identity) complete() bool {
	return i.clientID != "" && i.clientSecret != ""
}

// Telemetry is off: what the server asks of Infisical is nobody else's business.
func (i identity) environment() []string {
	environment := []string{"INFISICAL_DISABLE_TELEMETRY=1"}

	for _, variable := range i.variables() {
		if variable.value != "" {
			environment = append(environment, variable.key+"="+variable.value)
		}
	}

	return environment
}

func given(ctx *modules.Context) identity {
	return identity{
		domain:       ctx.String("domain"),
		clientID:     ctx.String("client_id"),
		clientSecret: ctx.Secret("client_secret"),
	}
}

// What the last Configure left, for the commands that run outside an install.
func stored(ctx *modules.Context) identity {
	read := func(key string) string {
		value, _, _ := env.Get(ctx, key)

		return value
	}

	return identity{
		domain:       read(domainKey),
		clientID:     read(clientIDKey),
		clientSecret: read(clientSecretKey),
	}
}

func loginArgv() []string {
	return []string{Program, "login", "--method=universal-auth", "--silent", "--plain"}
}

// A machine identity's access token expires: one is asked for each use, never kept.
func accessToken(ctx *modules.Context, held identity) (string, error) {
	out, err := modules.Quiet(ctx, sys.Command{
		User:    shell.User,
		Argv:    loginArgv(),
		Dir:     shell.Home,
		Env:     append(user.Environment(shell.User), held.environment()...),
		Timeout: login.Timeout,
	})

	accessToken := strings.TrimSpace(out.Stdout)
	ctx.Hide(accessToken)

	if err != nil {
		return "", err
	}

	if accessToken == "" {
		return "", errors.New(i18n.T("infisical.login.empty"))
	}

	return accessToken, nil
}

// The access token is a JWT that names its identity; the client ID stands for an identity it does not name.
func accountOf(accessToken, clientID string) string {
	parts := strings.Split(accessToken, ".")
	if len(parts) != 3 {
		return clientID
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return clientID
	}

	var claims struct {
		IdentityName string `json:"identityName"`
	}

	if json.Unmarshal(payload, &claims) != nil || claims.IdentityName == "" {
		return clientID
	}

	return claims.IdentityName
}
