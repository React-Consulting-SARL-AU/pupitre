//go:build staging

package staging

import (
	"os"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
)

// The app creates the tunnel on Cloudflare; the agent only ever receives these ids and the tunnel secret.
func tunnelConfig(t *testing.T) map[string]any {
	t.Helper()

	config := map[string]any{}

	for key, variable := range map[string]string{
		"account_tag": "PUPITRE_STAGING_TUNNEL_ACCOUNT",
		"tunnel_id":   "PUPITRE_STAGING_TUNNEL_ID",
		"domain":      "PUPITRE_STAGING_TUNNEL_DOMAIN",
	} {
		value := os.Getenv(variable)
		if value == "" {
			t.Skipf("%s is not set", variable)
		}

		config[key] = value
	}

	return config
}

func tunnelSecret(t *testing.T) string {
	t.Helper()

	secret := os.Getenv("PUPITRE_STAGING_TUNNEL_SECRET")
	if secret == "" {
		t.Skip("PUPITRE_STAGING_TUNNEL_SECRET is not set")
	}

	return secret
}

func installTunnel(t *testing.T, host string) response {
	t.Helper()

	install := request{Cmd: "install", Params: map[string]any{
		"secrets_stdin": true,
		"modules":       []string{"exposure.cloudflare"},
		"config": map[string]any{
			"core.system":         map[string]any{"timezone": "Europe/Paris", "git_name": "Pupitre Staging", "git_email": "staging@pupitre.studio"},
			"exposure.cloudflare": tunnelConfig(t),
		},
	}}

	secrets := `{"exposure.cloudflare":{"tunnel_secret":"` + tunnelSecret(t) + `"}}`
	first := agentWithSecrets(t, host, secrets, install)[0]

	if result := decode[contract.InstallResult](t, first.Result); len(result.Failed) != 0 {
		t.Fatalf("install failed: %v", result.Failed)
	}

	return first
}

func TestWithoutItsCredentialsTheConfigurationIsRefusedNotTheInstall(t *testing.T) {
	host := stagingHost(t)

	refused := attempt(t, host, request{Cmd: "install", Params: map[string]any{
		"secrets_stdin": false,
		"modules":       []string{"exposure.cloudflare"},
		"config":        map[string]any{"exposure.cloudflare": tunnelConfig(t)},
	}})[0]

	result := decode[contract.InstallResult](t, refused.Result)
	if len(result.Failed) != 1 || result.Failed[0] != "exposure.cloudflare" {
		t.Fatalf("the refusal must name the module: %v", result.Failed)
	}

	if !strings.Contains(strings.Join(messages(refused), " "), "champ requis manquant") {
		t.Fatalf("the refusal must name the missing field: %v", messages(refused))
	}

	if !strings.Contains(strings.Join(steps(refused, contract.StepOK), " "), "install-cloudflared") {
		t.Fatalf("cloudflared must be installed before the refusal: %v", steps(refused, contract.StepOK))
	}

	if out := ssh(t, host, "command", "-v", "cloudflared"); !strings.Contains(out, "cloudflared") {
		t.Fatalf("cloudflared must be on the machine:\n%s", out)
	}

	sync := attempt(t, host, request{Cmd: "tunnel.sync"})[0]
	if sync.OK || !strings.Contains(string(sync.Error), "service_not_found") {
		t.Fatalf("tunnel.sync must answer service_not_found: %s", sync.Error)
	}
}

func TestASubdomainGetsARoute(t *testing.T) {
	host := stagingHost(t)

	agent(t, host, request{Cmd: "project.add", Params: map[string]any{
		"name": "fixture", "dir": "fixture", "processes": []map[string]any{{
			"id": "web", "pkgmgr": "bun", "host": "fixture.localhost", "port": 3100,
			"routes": []map[string]any{{"label": "web", "port": 3100, "subdomain": "fixture"}}, "cmd": "bun run dev",
		}},
	}})

	installTunnel(t, host)

	config := ssh(t, host, "cat", "/etc/cloudflared/config.yml")
	if !strings.Contains(config, "hostname: fixture."+os.Getenv("PUPITRE_STAGING_TUNNEL_DOMAIN")) {
		t.Fatalf("the ingress must carry the project's route:\n%s", config)
	}

	status := agent(t, host, request{Cmd: "tunnel.status"})[0]
	report := decode[struct {
		Installed bool   `json:"installed"`
		State     string `json:"state"`
		Routes    []struct {
			Hostname string `json:"hostname"`
			Project  string `json:"project"`
		} `json:"routes"`
	}](t, status.Result)

	if !report.Installed || report.State != "running" || len(report.Routes) == 0 {
		t.Fatalf("the tunnel must run with at least one route: %+v", report)
	}

	url := agent(t, host, request{Cmd: "project.url", Params: map[string]any{"name": "fixture"}})[0]
	if address := decode[struct {
		URL string `json:"url"`
	}](t, url.Result).URL; !strings.HasPrefix(address, "https://fixture.") {
		t.Fatalf("with a tunnel the project answers on its subdomain, got %s", address)
	}

	if out := ssh(t, host, "sudo", "cat", "/etc/pupitre/exposure"); strings.TrimSpace(out) != "cloudflare" {
		t.Fatalf("the marker must name this exposure: %s", out)
	}
}

func TestWithoutATunnelTheUrlIsLocal(t *testing.T) {
	host := stagingHost(t)

	agent(t, host, request{Cmd: "uninstall", Params: map[string]any{"modules": []string{"exposure.cloudflare"}}})

	url := agent(t, host, request{Cmd: "project.url", Params: map[string]any{"name": "fixture"}})[0]
	if address := decode[struct {
		URL string `json:"url"`
	}](t, url.Result).URL; address != "http://fixture.localhost:3100" {
		t.Fatalf("without a tunnel the local address is the only true one, got %s", address)
	}

	status := agent(t, host, request{Cmd: "tunnel.status"})[0]
	if !strings.Contains(string(status.Result), `"state":"absent"`) {
		t.Fatalf("no tunnel, no state: %s", status.Result)
	}
}

func TestGithubClonesOverHttpsWithoutAKey(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	token := os.Getenv("PUPITRE_STAGING_GH_TOKEN")
	if token == "" {
		t.Skip("PUPITRE_STAGING_GH_TOKEN is not set")
	}

	agentWithSecrets(t, host, `{"tool.github":{"token":"`+token+`"}}`, request{Cmd: "install", Params: map[string]any{
		"secrets_stdin": true, "modules": []string{"tool.github"}, "config": map[string]any{},
	}})

	if out := ssh(t, dev, "gh", "auth", "status"); !strings.Contains(out, "github.com") {
		t.Fatalf("gh must be authenticated:\n%s", out)
	}

	if out := ssh(t, dev, "git", "config", "--global", "--get", "credential.https://github.com.helper"); !strings.Contains(out, "gh auth git-credential") {
		t.Fatalf("a HTTPS clone must go through gh:\n%s", out)
	}

	if out := ssh(t, dev, "gh", "ssh-key", "list"); strings.TrimSpace(out) == "" {
		t.Fatalf("the server key must be registered on the account:\n%s", out)
	}
}

func TestNeonPosesTheCliAndKeepsTheKey(t *testing.T) {
	host := stagingHost(t)

	key := os.Getenv("PUPITRE_STAGING_NEON_KEY")
	if key == "" {
		t.Skip("PUPITRE_STAGING_NEON_KEY is not set")
	}

	install := request{Cmd: "install", Params: map[string]any{
		"secrets_stdin": true,
		"modules":       []string{"tool.neon"},
	}}

	first := agentWithSecrets(t, host, `{"tool.neon":{"api_key":"`+key+`"}}`, install)[0]
	if result := decode[contract.InstallResult](t, first.Result); len(result.Failed) != 0 {
		t.Fatalf("install failed: %v", result.Failed)
	}

	if out := ssh(t, "dev@"+address(host), "neon", "--version"); strings.TrimSpace(out) == "" {
		t.Fatalf("the CLI must be on the path of dev:\n%s", out)
	}

	if out := ssh(t, host, "sudo", "grep", "NEON_API_KEY", "/etc/pupitre/env"); !strings.Contains(out, key) {
		t.Fatalf("the key belongs in /etc/pupitre/env:\n%s", out)
	}

	if out := ssh(t, "dev@"+address(host), "cat", "/etc/pupitre/env"); strings.Contains(out, key) {
		t.Fatal("root's file must not be readable by dev")
	}

	if out := ssh(t, "dev@"+address(host), "zsh", "-c", "'echo $NEON_API_KEY'"); !strings.Contains(out, key) {
		t.Fatalf("the dev shell must carry the key:\n%s", out)
	}

	if out := ssh(t, "dev@"+address(host), "neonctl", "--version"); strings.TrimSpace(out) == "" {
		t.Fatalf("the name the CLI prints for itself must answer:\n%s", out)
	}

	replay := agentWithSecrets(t, host, `{"tool.neon":{"api_key":"`+key+`"}}`, install)[0]
	if changed := steps(replay, contract.StepOK); len(changed) != 0 {
		t.Fatalf("a replay must change nothing: %v", changed)
	}
}

func TestProjectEnvFallsBackOnTheVersionedExample(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	ssh(t, dev, "mkdir", "-p", "/home/dev/projects/fixture")
	ssh(t, dev, "sh", "-c", `"printf 'DATABASE_URL=\\nAUTH_SECRET=\\n' > /home/dev/projects/fixture/.env.example"`)

	result := agent(t, host, request{Cmd: "project.env", Params: map[string]any{"name": "fixture", "force": true}})[0]
	if !strings.Contains(string(result.Result), `"keys":["DATABASE_URL","AUTH_SECRET"]`) {
		t.Fatalf("the keys of the generated file, never a value: %s", result.Result)
	}

	mode := ssh(t, dev, "stat", "-c", "%a", "/home/dev/projects/fixture/.env.local")
	if strings.TrimSpace(mode) != "600" {
		t.Fatalf(".env.local must be 0600, got %s", mode)
	}
}

func TestReplayingTheExposureInstallChangesNothing(t *testing.T) {
	host := stagingHost(t)

	installTunnel(t, host)
	second := installTunnel(t, host)

	if changed := steps(second, contract.StepOK); len(changed) != 0 {
		t.Fatalf("a replay must change nothing: %v", changed)
	}
}

func TestCaddyServesTheSameRoutesUnderItsOwnRules(t *testing.T) {
	host := stagingHost(t)

	domain := os.Getenv("PUPITRE_STAGING_CADDY_DOMAIN")
	if domain == "" {
		t.Skip("PUPITRE_STAGING_CADDY_DOMAIN is not set")
	}

	agent(t, host, request{Cmd: "uninstall", Params: map[string]any{"modules": []string{"exposure.cloudflare"}}})
	agent(t, host, request{Cmd: "project.add", Params: map[string]any{
		"name": "fixture", "dir": "fixture", "processes": []map[string]any{{
			"id": "web", "pkgmgr": "bun", "host": "fixture.localhost", "port": 3100,
			"routes": []map[string]any{{"label": "web", "port": 3100, "subdomain": "fixture"}}, "cmd": "bun run dev",
		}},
	}})

	install := request{Cmd: "install", Params: map[string]any{
		"secrets_stdin": false,
		"modules":       []string{"exposure.caddy"},
		"config": map[string]any{
			"exposure.caddy": map[string]any{
				"domain": domain, "email": "staging@pupitre.studio", "http_port": 80, "https_port": 443,
			},
		},
	}}

	if result := decode[contract.InstallResult](t, agent(t, host, install)[0].Result); len(result.Failed) != 0 {
		t.Fatalf("install failed: %v", result.Failed)
	}

	config := ssh(t, host, "sudo", "cat", "/etc/caddy/Caddyfile")
	if !strings.Contains(config, "fixture."+domain+" {") || !strings.Contains(config, "reverse_proxy fixture.localhost:3100") {
		t.Fatalf("the Caddyfile must carry the project's route:\n%s", config)
	}

	rules := ssh(t, host, "sudo", "ufw", "status")
	for _, want := range []string{"80/tcp", "443/tcp"} {
		if !strings.Contains(rules, want) {
			t.Errorf("ufw must let %s through, otherwise no certificate is ever issued:\n%s", want, rules)
		}
	}

	status := agent(t, host, request{Cmd: "tunnel.status"})[0]
	report := decode[struct {
		Installed bool   `json:"installed"`
		State     string `json:"state"`
		Routes    []struct {
			Hostname string `json:"hostname"`
		} `json:"routes"`
	}](t, status.Result)

	if !report.Installed || report.State != "running" || len(report.Routes) != 1 {
		t.Fatalf("tunnel.status must answer for the exposure that is installed: %+v", report)
	}
}

func TestTailscaleJoinsWithAnAuthKey(t *testing.T) {
	host := stagingHost(t)

	key := os.Getenv("PUPITRE_STAGING_TAILSCALE_KEY")
	if key == "" {
		t.Skip("PUPITRE_STAGING_TAILSCALE_KEY is not set")
	}

	install := request{Cmd: "install", Params: map[string]any{"secrets_stdin": true, "modules": []string{"exposure.tailscale"}, "config": map[string]any{"exposure.tailscale": map[string]any{"hostname": "pupitre-staging"}}}}
	secrets := `{"exposure.tailscale":{"auth_key":"` + key + `"}}`

	first := agentWithSecrets(t, host, secrets, install)[0]
	if result := decode[contract.InstallResult](t, first.Result); len(result.Failed) != 0 {
		t.Fatalf("install failed: %v", result.Failed)
	}

	status := agent(t, host, request{Cmd: "service.status", Params: map[string]any{"id": "exposure.tailscale"}})[0]
	service := decode[contract.ServiceStatus](t, status.Result)
	if service.Login == nil || service.Login.State != contract.LoginSignedIn {
		t.Fatalf("the node must be on the tailnet: %+v", service.Login)
	}

	if out := ssh(t, host, "ufw", "status"); !strings.Contains(out, "Anywhere on tailscale0") {
		t.Fatalf("the tailnet interface must be let in:\n%s", out)
	}

	if out := ssh(t, host, "cat", "/var/lib/pupitre/report.json", "/var/log/pupitre.log"); strings.Contains(out, key) {
		t.Fatal("the auth key leaked into the report or the journal")
	}
}
