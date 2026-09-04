//go:build staging

package staging

import (
	"os"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
)

// The zone the staging campaign is allowed to touch, and the account that owns it; without them the exposure tests stay out of the way.
func zone(t *testing.T) map[string]any {
	t.Helper()

	config := map[string]any{}
	for key, variable := range map[string]string{
		"account_id": "PUPITRE_STAGING_CF_ACCOUNT",
		"zone_id":    "PUPITRE_STAGING_CF_ZONE",
		"zone_name":  "PUPITRE_STAGING_CF_DOMAIN",
		"domain":     "PUPITRE_STAGING_CF_DOMAIN",
	} {
		value := os.Getenv(variable)
		if value == "" {
			t.Skipf("%s is not set", variable)
		}

		config[key] = value
	}

	return config
}

func cloudflareToken(t *testing.T) string {
	t.Helper()

	token := os.Getenv("PUPITRE_STAGING_CF_TOKEN")
	if token == "" {
		t.Skip("PUPITRE_STAGING_CF_TOKEN is not set")
	}

	return token
}

func installTunnel(t *testing.T, host string) response {
	t.Helper()

	install := request{Cmd: "install", Params: map[string]any{
		"secrets_stdin": true,
		"modules":       []string{"exposure.cloudflare"},
		"config": map[string]any{
			"core.system":         map[string]any{"timezone": "Europe/Paris", "git_name": "Pupitre Staging", "git_email": "staging@pupitre.studio"},
			"exposure.cloudflare": zone(t),
		},
	}}

	secrets := `{"exposure.cloudflare":{"api_token":"` + cloudflareToken(t) + `"}}`
	first := agentWithSecrets(t, host, secrets, install)[0]

	if result := decode[contract.InstallResult](t, first.Result); len(result.Failed) != 0 {
		t.Fatalf("install failed: %v", result.Failed)
	}

	return first
}

// The token is the one thing the module cannot invent: cloudflared installs, and the configuration is what refuses.
func TestWithoutATokenTheConfigurationIsRefusedNotTheInstall(t *testing.T) {
	host := stagingHost(t)

	refused := attempt(t, host, request{Cmd: "install", Params: map[string]any{
		"secrets_stdin": false,
		"modules":       []string{"exposure.cloudflare"},
		"config":        map[string]any{"exposure.cloudflare": zone(t)},
	}})[0]

	result := decode[contract.InstallResult](t, refused.Result)
	if len(result.Failed) != 1 || !strings.Contains(result.Failed[0], "champ requis manquant") {
		t.Fatalf("the refusal must name the missing field: %v", result.Failed)
	}

	if !strings.Contains(strings.Join(steps(refused, contract.StepOK), " "), "install-cloudflared") {
		t.Fatalf("cloudflared must be installed before the refusal: %v", steps(refused, contract.StepOK))
	}

	if out := ssh(t, host, "command", "-v", "cloudflared"); !strings.Contains(out, "cloudflared") {
		t.Fatalf("cloudflared must be on the machine:\n%s", out)
	}

	sync := attempt(t, host, request{Cmd: "tunnel.sync"})[0]
	if sync.OK || !strings.Contains(string(sync.Error), "bad_request") {
		t.Fatalf("tunnel.sync must answer bad_request: %s", sync.Error)
	}
}

func TestASubdomainGetsARouteAndADnsRecord(t *testing.T) {
	host := stagingHost(t)

	agent(t, host, request{Cmd: "project.add", Params: map[string]any{
		"name": "fixture", "dir": "fixture", "pkgmgr": "bun", "host": "fixture.localhost",
		"port": 3100, "subdomain": "fixture", "cmd": "bun run dev",
	}})

	installTunnel(t, host)

	config := ssh(t, host, "cat", "/etc/cloudflared/config.yml")
	if !strings.Contains(config, "hostname: fixture."+os.Getenv("PUPITRE_STAGING_CF_DOMAIN")) {
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

	resolved := ssh(t, host, "dig", "+short", "fixture."+os.Getenv("PUPITRE_STAGING_CF_DOMAIN"))
	if strings.TrimSpace(resolved) == "" {
		t.Fatalf("the DNS record must exist:\n%s", resolved)
	}
}

// Without a tunnel a project stays on its port, and the subdomain column of the registry is simply ignored.
func TestWithoutATunnelTheUrlIsLocal(t *testing.T) {
	host := stagingHost(t)

	agent(t, host, request{Cmd: "uninstall", Params: map[string]any{"modules": []string{"exposure.cloudflare"}}})
	agent(t, host, request{Cmd: "install", Params: map[string]any{
		"secrets_stdin": false, "modules": []string{"exposure.ssh"}, "config": map[string]any{},
	}})

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

func TestSecretsStatusNeverCarriesAValue(t *testing.T) {
	host := stagingHost(t)

	agentWithSecrets(t, host, `{"CHECK_KEY":"s3cret-de-staging"}`,
		request{Cmd: "secrets.set", Params: map[string]any{"key": "CHECK_KEY", "secrets_stdin": true}})

	status := agent(t, host, request{Cmd: "secrets.status"})[0]
	if !strings.Contains(string(status.Result), `"key":"CHECK_KEY"`) {
		t.Fatalf("the key must be listed: %s", status.Result)
	}

	if strings.Contains(string(status.Result), "s3cret-de-staging") {
		t.Fatalf("a value must never leave the machine: %s", status.Result)
	}

	stored := ssh(t, host, "sudo", "grep", "CHECK_KEY", "/etc/pupitre/env")
	if !strings.Contains(stored, "s3cret-de-staging") {
		t.Fatalf("the value belongs in /etc/pupitre/env:\n%s", stored)
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

func TestProjectEnvFallsBackOnTheVersionedExample(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	ssh(t, dev, "mkdir", "-p", "/home/dev/projects/fixture")
	ssh(t, dev, "sh", "-c", "printf 'DATABASE_URL=\\nAUTH_SECRET=\\n' > /home/dev/projects/fixture/.env.example")

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

	for _, changed := range steps(second, contract.StepOK) {
		if !strings.HasSuffix(changed, "sync-dns") {
			t.Fatalf("a replay must only skip, this ran again: %s", changed)
		}
	}
}
