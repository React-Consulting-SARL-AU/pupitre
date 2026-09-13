//go:build staging

package staging

import (
	"os"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
)

// The module poses wrangler by mise and hands both variables to the dev shell; service.status then says whose account the token opens.
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

	if out := ssh(t, dev, "cat", "/etc/pupitre/env"); strings.Contains(out, token) {
		t.Fatal("root's file must not be readable by dev")
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
