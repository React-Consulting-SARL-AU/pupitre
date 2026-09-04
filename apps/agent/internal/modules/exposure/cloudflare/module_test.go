package cloudflare

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys/env"
)

const (
	token   = "s3cret-de-test"
	account = "acc-1234"
	zone    = "zone-1234"
	domain  = "flymate.dev"
)

const projects = `web|flymate/apps/web|-|bun|web.localhost|3000|app|bun run dev
api|flymate/apps/api|-|bun|api.localhost|3001|-|bun run api
`

func values() modtest.Values {
	return modtest.Values{"account_id": account, "zone_id": zone, "zone_name": domain, "domain": domain}
}

func newContext(t *testing.T, fake *modtest.FakeSys, secrets modtest.Secrets) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Values: values(), Secrets: secrets})
}

func installedMachine() *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Packages[pkg] = "2026.6.1"
	fake.Files[keyringPath] = []byte("keyring")
	fake.Files[sourcePath] = []byte(sourceLine)
	fake.Files[registry.DefaultConf] = []byte(projects)
	fake.Files[credentialsPath] = credentials{AccountTag: account, TunnelID: "t-1234", TunnelSecret: "unused"}.encode()
	fake.Files[configPath] = ingress("t-1234", domain, projectsOf(projects))
	fake.Files[unitPath] = unit
	fake.Files[env.Path] = []byte("CLOUDFLARE_API_TOKEN=" + token + "\nPUPITRE_DOMAIN=" + domain + "\n")
	fake.Units[Unit] = modtest.UnitActive
	fake.Answer("dns_records?name=app."+domain, `{"success":true,"result":[{"id":"r-1","content":"t-1234.cfargotunnel.com"}]}`)

	return fake
}

func projectsOf(raw string) []registry.Project {
	return registry.Parse([]byte(raw), false)
}

func TestInstallAndConfigureAreIdempotent(t *testing.T) {
	fake := installedMachine()
	ctx := newContext(t, fake, modtest.Secrets{"api_token": token})

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}

	if fake.Restarts[Unit] != 0 {
		t.Fatalf("cloudflared restarted %d times on a configured machine", fake.Restarts[Unit])
	}

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine: %v", fake.Mutations)
	}
}

// The token is what the module cannot invent: cloudflared installs, and the configuration refuses.
func TestConfigureWithoutTokenIsRefusedAfterTheInstall(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[registry.DefaultConf] = []byte(projects)
	ctx := newContext(t, fake, nil)

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatalf("cloudflared must install without a token: %v", err)
	}

	if _, installed := fake.Packages[pkg]; !installed {
		t.Fatal("the package must be there before the configuration is even attempted")
	}

	err := (Module{}).Configure(ctx)

	failure, isProtocol := err.(*protocol.Error)
	if !isProtocol {
		t.Fatalf("want a protocol error, got %#v", err)
	}

	if failure.Code != contract.ErrorBadRequest {
		t.Fatalf("want bad_request, got %s", failure.Code)
	}

	if !strings.Contains(failure.Message, "Jeton d'API") || failure.Fix == "" {
		t.Fatalf("the refusal must name the missing field and say how to fix it: %+v", failure)
	}

	if fake.Files[configPath] != nil {
		t.Fatal("nothing must be written when the configuration is refused")
	}
}

func TestTheTunnelIsCreatedWithARouteAndARecordPerSubdomain(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Packages[pkg] = "2026.6.1"
	fake.Files[registry.DefaultConf] = []byte(projects)
	fake.Answer("cfd_tunnel", `{"success":true,"result":{"id":"t-1234"}}`)
	fake.Answer("dns_records?name=app."+domain, `{"success":true,"result":[]}`)
	fake.Answer("dns_records ", `{"success":true,"result":{"id":"r-1"}}`)
	ctx := newContext(t, fake, modtest.Secrets{"api_token": token})

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	config := string(fake.Files[configPath])
	if !strings.Contains(config, "hostname: app."+domain) || !strings.Contains(config, "service: http://web.localhost:3000") {
		t.Fatalf("the project that declares a subdomain must get a route:\n%s", config)
	}

	if strings.Contains(config, "api.localhost") {
		t.Fatalf("a project without a subdomain has no route:\n%s", config)
	}

	created := false
	for _, line := range fake.Commands() {
		if strings.Contains(line, "-X POST") && strings.Contains(line, "dns_records") {
			created = true
		}
	}
	if !created {
		t.Fatalf("the subdomain must get a DNS record:\n%s", strings.Join(fake.Commands(), "\n"))
	}

	if fake.Units[Unit] != modtest.UnitActive {
		t.Fatal("cloudflared must be enabled once the tunnel is configured")
	}

	if fake.EnvValue(env.DomainKey) != domain {
		t.Fatalf("project.url reads %s, it must carry the domain", env.DomainKey)
	}
}

func TestSecretNeverLeaks(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Packages[pkg] = "2026.6.1"
	fake.Files[registry.DefaultConf] = []byte(projects)
	fake.Answer("cfd_tunnel", `{"success":true,"result":{"id":"t-1234"}}`)
	fake.Answer("dns_records", `{"success":true,"result":[{"id":"r-1","content":"t-1234.cfargotunnel.com"}]}`)
	ctx := newContext(t, fake, modtest.Secrets{"api_token": token})

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	for _, line := range ctx.Output() {
		if strings.Contains(line, token) {
			t.Fatalf("secret in output: %s", line)
		}
	}

	if strings.Contains(string(fake.Files[configPath]), token) {
		t.Fatal("the ingress carries no secret")
	}

	if fake.EnvValue(tokenKey) != token {
		t.Fatalf("the token belongs in %s", env.Path)
	}

	for _, path := range []string{credentialsPath, env.Path} {
		if mode := fake.Modes[path]; mode != 0o600 {
			t.Fatalf("%s must be 0600, got %o", path, mode)
		}
	}
}

func TestFailedStepReportsReplay(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailPackage(pkg, "E: Unable to locate package cloudflared")
	ctx := newContext(t, fake, modtest.Secrets{"api_token": token})

	if err := (Module{}).Install(ctx); err == nil {
		t.Fatal("expected install to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected event: %+v", last)
	}
}

func TestStatusListsTheRoutesAndNeverAValue(t *testing.T) {
	fake := installedMachine()
	ctx := newContext(t, fake, modtest.Secrets{"api_token": token})

	report, err := Status(ctx)
	if err != nil {
		t.Fatal(err)
	}

	if !report.Installed || report.State != StateRunning {
		t.Fatalf("unexpected report: %+v", report)
	}

	if len(report.Routes) != 1 || report.Routes[0].Hostname != "app."+domain || report.Routes[0].Project != "web" {
		t.Fatalf("unexpected routes: %+v", report.Routes)
	}

	status, err := (Module{}).Status(ctx)
	if err != nil {
		t.Fatal(err)
	}

	for label, value := range status.Credentials {
		if strings.Contains(value, token) {
			t.Fatalf("%s carries a value instead of a key", label)
		}
	}
}

func TestUninstallGivesBackWhatTheModuleInstalled(t *testing.T) {
	fake := installedMachine()
	ctx := newContext(t, fake, modtest.Secrets{"api_token": token})

	if err := (Module{}).Uninstall(ctx); err != nil {
		t.Fatal(err)
	}

	if _, present := fake.Packages[pkg]; present {
		t.Fatal("the package must be removed")
	}

	if fake.EnvValue(env.DomainKey) != "" || fake.EnvValue(tokenKey) != "" {
		t.Fatal("the module's keys must leave /etc/pupitre/env")
	}

	if fake.Files[registry.DefaultConf] == nil {
		t.Fatal("the project registry belongs to the client")
	}
}

var _ modules.Module = Module{}
