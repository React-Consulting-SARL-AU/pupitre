package caddy

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure/routes"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys/env"
)

const (
	domain = "flymate.dev"
	email  = "jordan@flymate.dev"
)

const projects = `web|flymate/apps/web|-|bun|web.localhost|3000|app|bun run dev
api|flymate/apps/api|-|bun|api.localhost|3001|-|bun run api
`

func values() modtest.Values {
	return modtest.Values{"domain": domain, "email": email, "http_port": DefaultHTTPPort, "https_port": DefaultHTTPSPort}
}

func newContext(t *testing.T, fake *modtest.FakeSys, chosen modtest.Values) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Values: chosen})
}

func machine() *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Files[registry.DefaultConf] = []byte(projects)
	fake.Firewall = modtest.Firewall{Active: true, Incoming: "deny", Outgoing: "allow", Rules: []string{"22"}}

	return fake
}

func run(t *testing.T, ctx *modules.Context) {
	t.Helper()

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}
}

func statuses(ctx *modules.Context) map[string]contract.StepStatus {
	result := map[string]contract.StepStatus{}
	for _, event := range ctx.Events() {
		result[event.Step] = event.Status
	}

	return result
}

// Only the project that declares a subdomain gets a site block; the other stays on its port, behind the app's SSH session.
func TestCaddyfileRoutesOnlyTheProjectsThatDeclareASubdomain(t *testing.T) {
	fake := machine()
	ctx := newContext(t, fake, values())

	run(t, ctx)

	config := string(fake.Files[configPath])
	for _, want := range []string{"email " + email, "http_port 80", "app." + domain + " {", "reverse_proxy web.localhost:3000", "header_up Host web.localhost:3000"} {
		if !strings.Contains(config, want) {
			t.Errorf("Caddyfile lacks %q:\n%s", want, config)
		}
	}

	if strings.Contains(config, "api."+domain) {
		t.Fatalf("a project without a subdomain must not be exposed:\n%s", config)
	}

	report, err := Status(ctx)
	if err != nil || len(report.Routes) != 1 || report.Routes[0].Hostname != "app."+domain {
		t.Fatalf("report = %+v, %v", report, err)
	}
}

// core.hardening owns the bare 22 and 443 of SSH; Caddy writes <port>/tcp so the two never fight over the same rule.
func TestFirewallOpensTheWebPortsUnderTheirOwnRules(t *testing.T) {
	fake := machine()
	run(t, newContext(t, fake, values()))

	for _, want := range []string{"80/tcp", "443/tcp"} {
		if !allowed(newContext(t, fake, values()))[want] {
			t.Errorf("ufw does not allow %s: %v", want, fake.Firewall.Rules)
		}
	}

	if allowed(newContext(t, fake, values()))["443"] {
		t.Fatal("Caddy must not touch the bare 443 rule of SSH")
	}
}

func TestChosenPortsReachTheCaddyfileAndTheFirewall(t *testing.T) {
	fake := machine()
	ctx := newContext(t, fake, modtest.Values{"domain": domain, "email": email, "http_port": 8080, "https_port": 8443})

	run(t, ctx)

	config := string(fake.Files[configPath])
	if !strings.Contains(config, "http_port 8080") || !strings.Contains(config, "https_port 8443") {
		t.Fatalf("Caddyfile = %s", config)
	}

	if !allowed(ctx)["8443/tcp"] {
		t.Fatalf("ufw rules = %v", fake.Firewall.Rules)
	}
}

// The engine refuses a configuration before the first step, so the module never
// sees an empty domain. What this module owes is the declaration it is refused on.
func TestTheManifestHoldsTheDomainAndTheAddressToTheirShape(t *testing.T) {
	shapes := map[string]string{
		"domain":     contract.FormatDomain,
		"email":      contract.FormatEmail,
		"http_port":  contract.FormatPort,
		"https_port": contract.FormatPort,
	}

	for _, field := range manifest().Fields {
		wanted, checked := shapes[field.Key]
		if !checked {
			continue
		}

		if field.Format != wanted {
			t.Errorf("%s format = %q, want %q", field.Key, field.Format, wanted)
		}

		delete(shapes, field.Key)
	}

	for key := range shapes {
		t.Errorf("the manifest declares no %s field", key)
	}
}

func TestARequiredFieldLeftEmptyIsRefused(t *testing.T) {
	held := func(string, string) int { return 0 }

	for _, field := range manifest().Fields {
		if !field.Required || field.Kind != contract.FieldText {
			continue
		}

		if contract.ValidateField(ID, field, "", held) == nil {
			t.Errorf("%s: an empty required field passes", field.Key)
		}
	}
}

func TestReplayOnAConfiguredMachineChangesNothing(t *testing.T) {
	fake := machine()
	run(t, newContext(t, fake, values()))

	mutations := len(fake.Mutations)
	restarts := fake.Restarts[Unit]
	ctx := newContext(t, fake, values())
	run(t, ctx)

	for step, status := range statuses(ctx) {
		if status != contract.StepSkip {
			t.Errorf("replay: %s = %s, want skip", step, status)
		}
	}

	if len(fake.Mutations) != mutations || fake.Restarts[Unit] != restarts {
		t.Fatalf("replay touched the machine: %v", fake.Mutations[mutations:])
	}
}

// A project added after the install reaches the proxy through a reload, which keeps the certificates and the open connections.
func TestSyncPicksUpANewProject(t *testing.T) {
	fake := machine()
	run(t, newContext(t, fake, values()))

	fake.Files[registry.DefaultConf] = []byte(projects + "docs|flymate/apps/docs|-|bun|docs.localhost|3002|docs|bun run docs\n")

	ctx := newContext(t, fake, values())
	report, err := Sync(ctx)
	if err != nil {
		t.Fatal(err)
	}

	if len(report.Routes) != 2 || report.State != routes.StateRunning {
		t.Fatalf("report = %+v", report)
	}

	if statuses(ctx)["reload-service"] != contract.StepOK {
		t.Fatalf("steps = %v", statuses(ctx))
	}
}

func TestFailedStepReportsItsReplayCommand(t *testing.T) {
	fake := machine()
	fake.FailPackage(pkg, "E: Unable to locate package caddy")
	ctx := newContext(t, fake, values())

	if err := (Module{}).Install(ctx); err == nil {
		t.Fatal("expected install to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only=exposure.caddy" {
		t.Fatalf("unexpected event: %+v", last)
	}
}

func TestUninstallGivesBackTheModeAndThePorts(t *testing.T) {
	fake := machine()
	run(t, newContext(t, fake, values()))

	ctx := newContext(t, fake, values())
	if err := (Module{}).Uninstall(ctx); err != nil {
		t.Fatal(err)
	}

	if fake.EnvValue(env.DomainKey) != "" || allowed(ctx)["443/tcp"] {
		t.Fatalf("uninstall left %q and %v behind", fake.EnvValue(env.DomainKey), fake.Firewall.Rules)
	}
}

var _ modules.Module = Module{}
