package caddy

import (
	"errors"
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure/routes"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/ufw"
)

const (
	domain = "flyleaf.dev"
	email  = "jordan@flyleaf.dev"
)

const projects = `web|flyleaf/apps/web|-|bun|web.localhost|3000|app|bun run dev
api|flyleaf/apps/api|-|bun|api.localhost|3001|-|bun run api
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

func TestCaddyfileCarriesEveryRouteOfAProject(t *testing.T) {
	fake := machine()
	fake.Files[registry.DefaultLocal] = []byte(`{"projects":[{"name":"shop","dir":"shop","processes":[{"id":"shop","pkgmgr":"bun","host":"127.0.0.1","port":3100,"routes":[{"label":"web","port":3100,"hostname":"shop.` + domain + `"},{"label":"api","port":3101,"hostname":"api-shop.` + domain + `"},{"label":"docs","port":3102}],"cmd":"bunx turbo run dev"}]}]}`)
	ctx := newContext(t, fake, values())

	run(t, ctx)

	config := string(fake.Files[configPath])

	for _, want := range []string{"shop." + domain + " {", "reverse_proxy 127.0.0.1:3100", "api-shop." + domain + " {", "reverse_proxy 127.0.0.1:3101", "header_up Host 127.0.0.1:3101"} {
		if !strings.Contains(config, want) {
			t.Errorf("Caddyfile lacks %q:\n%s", want, config)
		}
	}

	if strings.Contains(config, "127.0.0.1:3102") {
		t.Fatalf("a port without a name on the web is not exposed:\n%s", config)
	}

	report, err := Status(ctx)
	if err != nil || len(report.Routes) != 3 {
		t.Fatalf("report = %+v, %v", report, err)
	}
}

func TestFirewallOpensTheWebPortsUnderTheirOwnRules(t *testing.T) {
	fake := machine()
	run(t, newContext(t, fake, values()))

	for _, want := range []string{"80/tcp", "443/tcp"} {
		if !owned(newContext(t, fake, values()))[want] {
			t.Errorf("ufw does not allow %s: %v", want, fake.Firewall.Rules)
		}
	}

	if owned(newContext(t, fake, values()))["443"] {
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

	if !owned(ctx)["8443/tcp"] {
		t.Fatalf("ufw rules = %v", fake.Firewall.Rules)
	}
}

func TestMovedPortsCloseTheOldRulesAndKeepTheClientsOwn(t *testing.T) {
	fake := machine()
	run(t, newContext(t, fake, values()))
	fake.Firewall.Rules = append(fake.Firewall.Rules, "8080/tcp")

	ctx := newContext(t, fake, modtest.Values{"domain": domain, "email": email, "http_port": 8081, "https_port": 8443})
	run(t, ctx)

	rules := owned(ctx)
	if rules["80/tcp"] || rules["443/tcp"] || !rules["8081/tcp"] || !rules["8443/tcp"] {
		t.Fatalf("the old ports must be closed and the new ones open: %v", fake.Firewall.Rules)
	}

	if !slices.Contains(fake.Firewall.Rules, "22") || !slices.Contains(fake.Firewall.Rules, "8080/tcp") {
		t.Fatalf("a rule without the module's comment is the client's, and stays: %v", fake.Firewall.Rules)
	}
}

func TestRulesAreReadBeforeTheFirewallIsUp(t *testing.T) {
	fake := machine()
	fake.Firewall.Active = false
	run(t, newContext(t, fake, values()))

	mutations := len(fake.Mutations)
	ctx := newContext(t, fake, values())
	run(t, ctx)

	if statuses(ctx)["sync-firewall"] != contract.StepSkip || len(fake.Mutations) != mutations {
		t.Fatalf("a replay must find its rules whether ufw is enabled or not: %v", fake.Mutations[mutations:])
	}
}

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
	held := func(string, string) []string { return nil }

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

func TestSyncPicksUpANewProject(t *testing.T) {
	fake := machine()
	run(t, newContext(t, fake, values()))

	fake.Files[registry.DefaultConf] = []byte(projects + "docs|flyleaf/apps/docs|-|bun|docs.localhost|3002|docs|bun run docs\n")

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

	if fake.EnvValue(env.DomainKey) != "" || owned(ctx)["443/tcp"] {
		t.Fatalf("uninstall left %q and %v behind", fake.EnvValue(env.DomainKey), fake.Firewall.Rules)
	}
}

func TestUninstallKeepsTheDomainOfTheExposureThatHoldsTheMachine(t *testing.T) {
	fake := machine()
	run(t, newContext(t, fake, values()))
	fake.Files[modePath] = routes.Marker("cloudflare")

	if err := (Module{}).Uninstall(newContext(t, fake, values())); err != nil {
		t.Fatal(err)
	}

	if fake.EnvValue(env.DomainKey) != domain || string(fake.Files[modePath]) != "cloudflare\n" {
		t.Fatalf("domain %q, marker %q: both belong to the tunnel", fake.EnvValue(env.DomainKey), fake.Files[modePath])
	}

	if fake.EnvValue(portsKey) != "" {
		t.Fatal("caddy's own ports go with it")
	}
}

var _ modules.Module = Module{}

func TestACaddyWithoutTheMarkerIsNotOurs(t *testing.T) {
	fake := machine()
	fake.Packages[pkg] = "2.10.0"
	ctx := newContext(t, fake, values())

	status, err := (Module{}).Status(ctx)
	if err != nil || status.Installed {
		t.Fatalf("status = %+v, %v: the package alone must not read as installed", status, err)
	}

	report, err := Status(ctx)
	if err != nil || report.Installed || report.Provider != nil || report.State != "absent" {
		t.Fatalf("report = %+v, %v", report, err)
	}

	if _, err := Sync(ctx); err == nil {
		t.Fatal("syncing a caddy that is not ours must be refused")
	}

	fake.Files[modePath] = mode

	if status, _ := (Module{}).Status(ctx); !status.Installed {
		t.Fatal("the marker plus the package is this module")
	}
}

func TestEveryFirewallCallIsBounded(t *testing.T) {
	fake := machine()
	run(t, newContext(t, fake, values()))

	if err := (Module{}).Uninstall(newContext(t, fake, values())); err != nil {
		t.Fatal(err)
	}

	for _, call := range fake.Calls {
		if call.Argv[0] == "ufw" && call.Timeout != ufw.Timeout {
			t.Fatalf("ufw call without the timeout: %v", call.Argv)
		}
	}
}

func TestACaddyfileCaddyRefusesIsNotReloadedAndTheReasonIsInTheStep(t *testing.T) {
	fake := machine()
	run(t, newContext(t, fake, values()))
	reloads := fake.Restarts[Unit]

	fake.Files[registry.DefaultConf] = []byte(projects + "docs|flyleaf/apps/docs|-|bun|docs.localhost|3002|docs|bun run docs\n")
	fake.FailProgram("caddy", "Error: adapting config using caddyfile: /etc/caddy/Caddyfile:12: unrecognized directive: reverse_proxi")

	ctx := newContext(t, fake, values())
	_, err := Sync(ctx)
	if err == nil || !strings.Contains(err.Error(), "unrecognized directive") || !strings.Contains(err.Error(), "caddy refuses") {
		t.Fatalf("sync = %v, want the validation output", err)
	}

	var refusal *protocol.Error
	if !errors.As(err, &refusal) || refusal.Code != contract.ErrorBadRequest || refusal.Fix == "" {
		t.Fatalf("sync = %#v, want a bad_request refusal with its fix, not an internal error", err)
	}

	if fake.Restarts[Unit] != reloads {
		t.Fatalf("caddy reloaded %d time(s) on a Caddyfile it refuses", fake.Restarts[Unit]-reloads)
	}

	commands := strings.Join(fake.Commands(), "\n")
	if !strings.Contains(commands, "caddy validate --config "+candidatePath+" --adapter caddyfile") {
		t.Fatalf("caddy validate must weigh the candidate before it replaces anything:\n%s", commands)
	}
}

func TestARefusedCaddyfileNeverReplacesTheOneCaddyRuns(t *testing.T) {
	fake := machine()
	run(t, newContext(t, fake, values()))
	serving := string(fake.Files[configPath])

	fake.Files[registry.DefaultConf] = []byte(projects + "docs|flyleaf/apps/docs|-|bun|docs.localhost|3002|docs|bun run docs\n")
	fake.FailProgram("caddy", "Error: adapting config using caddyfile: unrecognized directive: reverse_proxi")

	if err := (Module{}).Configure(newContext(t, fake, values())); err == nil {
		t.Fatal("a Caddyfile caddy refuses must fail the step")
	}

	if got := string(fake.Files[configPath]); got != serving {
		t.Fatalf("the Caddyfile caddy runs was replaced by a refused one:\n%s", got)
	}

	if _, left := fake.Files[candidatePath]; left {
		t.Fatal("the refused candidate must not stay behind")
	}

	delete(fake.Failures, "caddy")
	ctx := newContext(t, fake, values())
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(string(fake.Files[configPath]), "docs."+domain) || statuses(ctx)["write-caddyfile"] != contract.StepOK {
		t.Fatalf("the replay must write what it could not before: %v", statuses(ctx))
	}
}

func TestAReplayWeighsTheCaddyfileItFindsIdentical(t *testing.T) {
	fake := machine()
	run(t, newContext(t, fake, values()))
	fake.FailProgram("caddy", "Error: adapting config using caddyfile: unrecognized directive: reverse_proxi")

	err := (Module{}).Configure(newContext(t, fake, values()))
	if err == nil || !strings.Contains(err.Error(), "unrecognized directive") {
		t.Fatalf("configure = %v, want the refusal of the Caddyfile on disk", err)
	}
}

func TestTheExposureMarkerIsRootsAlone(t *testing.T) {
	fake := machine()
	run(t, newContext(t, fake, values()))

	if fake.Modes[modePath] != 0o600 {
		t.Fatalf("%s mode = %o, want 0600", modePath, fake.Modes[modePath])
	}

	fake.Modes[modePath] = 0o644
	ctx := newContext(t, fake, values())
	run(t, ctx)

	if fake.Modes[modePath] != 0o600 || statuses(ctx)["declare-mode"] != contract.StepOK {
		t.Fatalf("a marker left readable by an older agent must be closed on the next pass: %o, %v", fake.Modes[modePath], statuses(ctx))
	}
}
