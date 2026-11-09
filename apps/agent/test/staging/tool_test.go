//go:build staging

package staging

import (
	"os"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
)

func TestWranglerPosesTheCliAndNamesTheAccount(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	token := os.Getenv("PUPITRE_STAGING_CLOUDFLARE_TOKEN")
	account := os.Getenv("PUPITRE_STAGING_TUNNEL_ACCOUNT")
	if token == "" || account == "" {
		t.Skip("PUPITRE_STAGING_CLOUDFLARE_TOKEN or PUPITRE_STAGING_TUNNEL_ACCOUNT is not set")
	}

	install := request{Cmd: "install", Params: map[string]any{
		"secrets_stdin": true,
		"modules":       []string{"tool.wrangler"},
		"config":        map[string]any{"tool.wrangler": map[string]any{"account_id": account}},
	}}
	secrets := `{"tool.wrangler":{"api_token":"` + token + `"}}`

	first := agentWithSecrets(t, host, secrets, install)[0]
	if result := decode[contract.InstallResult](t, first.Result); len(result.Failed) != 0 {
		t.Fatalf("install failed: %v", result.Failed)
	}

	if out := ssh(t, dev, "wrangler", "--version"); strings.TrimSpace(out) == "" {
		t.Fatalf("the CLI must be on the path of dev:\n%s", out)
	}

	if out := ssh(t, dev, "zsh", "-c", "'echo $CLOUDFLARE_API_TOKEN $CLOUDFLARE_ACCOUNT_ID'"); !strings.Contains(out, token) || !strings.Contains(out, account) {
		t.Fatalf("the dev shell must carry both variables:\n%s", out)
	}

	if out, err := sshCommand(dev, "cat", "/etc/pupitre/env").CombinedOutput(); err == nil || strings.Contains(string(out), token) {
		t.Fatalf("root's file must not be readable by dev:\n%s", out)
	}

	status := agent(t, host, request{Cmd: "service.status", Params: map[string]any{"id": "tool.wrangler"}})[0]
	service := decode[contract.ServiceStatus](t, status.Result)
	if service.Login == nil || service.Login.State != contract.LoginSignedIn || service.Login.Account == "" {
		t.Fatalf("the token must open an account: %+v", service.Login)
	}

	replay := agentWithSecrets(t, host, secrets, install)[0]
	if changed := steps(replay, contract.StepOK); len(changed) != 0 {
		t.Fatalf("a replay must change nothing: %v", changed)
	}
}

func TestInfisicalPosesTheCliAndNamesTheMachineIdentity(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	clientID := os.Getenv("PUPITRE_STAGING_INFISICAL_CLIENT_ID")
	clientSecret := os.Getenv("PUPITRE_STAGING_INFISICAL_CLIENT_SECRET")
	domain := os.Getenv("PUPITRE_STAGING_INFISICAL_DOMAIN")
	real := clientID != "" && clientSecret != ""

	if !real {
		clientID, clientSecret = "00000000-0000-4000-8000-000000000000", "placeholder-s3cret-de-test"
	}

	if domain == "" {
		domain = contract.Infisical.DefaultDomain
	}

	install := request{Cmd: "install", Params: map[string]any{
		"secrets_stdin": true,
		"modules":       []string{"tool.infisical"},
		"config":        map[string]any{"tool.infisical": map[string]any{"domain": domain, "client_id": clientID}},
	}}
	secrets := `{"tool.infisical":{"client_secret":"` + clientSecret + `"}}`

	first := agentWithSecrets(t, host, secrets, install)[0]
	if result := decode[contract.InstallResult](t, first.Result); len(result.Failed) != 0 {
		t.Fatalf("install failed: %v", result.Failed)
	}

	if out := ssh(t, dev, "infisical", "--version"); strings.TrimSpace(out) == "" {
		t.Fatalf("the CLI must be on the path of dev:\n%s", out)
	}

	if out := ssh(t, dev, "zsh", "-c", "'echo $INFISICAL_DOMAIN $INFISICAL_UNIVERSAL_AUTH_CLIENT_ID $INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET'"); !strings.Contains(out, domain) || !strings.Contains(out, clientID) || !strings.Contains(out, clientSecret) {
		t.Fatalf("the dev shell must carry the identity:\n%s", out)
	}

	if out, err := sshCommand(dev, "cat", "/etc/pupitre/env").CombinedOutput(); err == nil || strings.Contains(string(out), clientSecret) {
		t.Fatalf("root's file must not be readable by dev:\n%s", out)
	}

	status := agent(t, host, request{Cmd: "service.status", Params: map[string]any{"id": "tool.infisical"}})[0]
	service := decode[contract.ServiceStatus](t, status.Result)
	if service.Login == nil || (real && (service.Login.State != contract.LoginSignedIn || service.Login.Account == "")) || (!real && service.Login.State != contract.LoginUnknown) {
		t.Fatalf("login = %+v (real identity: %v)", service.Login, real)
	}

	replay := agentWithSecrets(t, host, secrets, install)[0]
	if changed := steps(replay, contract.StepOK); len(changed) != 0 {
		t.Fatalf("a replay must change nothing: %v", changed)
	}
}

func TestTheConnectedClisLandWithTheirVariables(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	tools := []struct {
		id, program, field, key, variable string
	}{
		{"tool.vercel", "vercel", "token", "PUPITRE_STAGING_VERCEL_TOKEN", "VERCEL_TOKEN"},
		{"tool.supabase", "supabase", "access_token", "PUPITRE_STAGING_SUPABASE_TOKEN", "SUPABASE_ACCESS_TOKEN"},
		{"tool.stripe", "stripe", "api_key", "PUPITRE_STAGING_STRIPE_KEY", "STRIPE_API_KEY"},
	}

	for _, tool := range tools {
		t.Run(tool.id, func(t *testing.T) {
			secret := os.Getenv(tool.key)
			real := secret != ""
			if !real {
				secret = "placeholder-s3cret-de-test"
			}

			install := request{Cmd: "install", Params: map[string]any{"secrets_stdin": true, "modules": []string{tool.id}, "config": map[string]any{}}}
			secrets := `{"` + tool.id + `":{"` + tool.field + `":"` + secret + `"}}`

			first := agentWithSecrets(t, host, secrets, install)[0]
			if result := decode[contract.InstallResult](t, first.Result); len(result.Failed) != 0 {
				t.Fatalf("install failed: %v", result.Failed)
			}

			if out := ssh(t, dev, tool.program, "--version"); strings.TrimSpace(out) == "" {
				t.Fatalf("the CLI must be on the path of dev:\n%s", out)
			}

			if out := ssh(t, dev, "zsh", "-c", "'echo $"+tool.variable+"'"); !strings.Contains(out, secret) {
				t.Fatalf("the dev shell must carry %s:\n%s", tool.variable, out)
			}

			status := agent(t, host, request{Cmd: "service.status", Params: map[string]any{"id": tool.id}})[0]
			service := decode[contract.ServiceStatus](t, status.Result)
			if service.Login == nil || (real && service.Login.State != contract.LoginSignedIn) || (!real && service.Login.State != contract.LoginUnknown) {
				t.Fatalf("login = %+v (real secret: %v)", service.Login, real)
			}

			replay := agentWithSecrets(t, host, secrets, install)[0]
			if changed := steps(replay, contract.StepOK); len(changed) != 0 {
				t.Fatalf("a replay must change nothing: %v", changed)
			}
		})
	}
}
