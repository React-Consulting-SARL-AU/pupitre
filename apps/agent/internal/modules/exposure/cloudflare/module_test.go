package cloudflare

import (
	"reflect"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure/cloudflared"
	"pupitre.studio/agent/internal/modules/exposure/routes"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys/env"
)

const (
	account = "0123456789abcdef0123456789abcdef"
	tunnel  = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b"
	secret  = "s3cret-de-test"
	domain  = "pupitre.sh"
	label   = "hibou-tranquille-4821"
)

const projects = `web|flyleaf/apps/web|-|bun|web.localhost|3000|` + label + `|bun run dev
api|flyleaf/apps/api|-|bun|api.localhost|3001|-|bun run api
`

func values() modtest.Values {
	return modtest.Values{"account_tag": account, "tunnel_id": tunnel, "domain": domain}
}

func newContext(t *testing.T, fake *modtest.FakeSys, secrets modtest.Secrets) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Values: values(), Secrets: secrets})
}

func bareMachine() *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Files[registry.DefaultConf] = []byte(projects)

	return fake
}

func equipped(t *testing.T) *modtest.FakeSys {
	t.Helper()

	fake := bareMachine()
	ctx := newContext(t, fake, modtest.Secrets{"tunnel_secret": secret})

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	return fake
}

func TestTheIngressCarriesEveryRouteOfAProject(t *testing.T) {
	fake := bareMachine()
	fake.Files[registry.DefaultLocal] = []byte(`{"projects":[{"name":"shop","dir":"shop","processes":[{"id":"shop","pkgmgr":"bun","host":"127.0.0.1","port":3100,"routes":[{"label":"web","port":3100,"hostname":"shop.` + domain + `"},{"label":"api","port":3101,"hostname":"api-shop.` + domain + `"},{"label":"docs","port":3102}],"cmd":"bunx turbo run dev"}]}]}`)
	ctx := newContext(t, fake, modtest.Secrets{"tunnel_secret": secret})

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	ingress := string(fake.Files[cloudflared.ConfigPath])

	for _, want := range []string{"hostname: shop." + domain, "service: http://127.0.0.1:3100", "hostname: api-shop." + domain, "service: http://127.0.0.1:3101", "httpHostHeader: 127.0.0.1:3101"} {
		if !strings.Contains(ingress, want) {
			t.Errorf("ingress lacks %q:\n%s", want, ingress)
		}
	}

	if strings.Contains(ingress, "127.0.0.1:3102") {
		t.Fatalf("a port without a name on the web is not exposed:\n%s", ingress)
	}

	report, err := Status(ctx)
	if err != nil || len(report.Routes) != 3 {
		t.Fatalf("report = %+v, %v", report, err)
	}
}

func TestAnotherDomainMovesEveryNameTheProjectsAnswerTo(t *testing.T) {
	fake := bareMachine()
	fake.Files[env.Path] = []byte(env.DomainKey + "=old.example\n")
	fake.Files[registry.DefaultLocal] = []byte(`{"projects":[{"name":"shop","dir":"shop","processes":[{"id":"shop","pkgmgr":"bun","host":"127.0.0.1","port":3100,"routes":[{"label":"web","port":3100,"hostname":"shop.old.example"},{"label":"api","port":3101,"hostname":"api-shop.old.example"},{"label":"docs","port":3102}],"cmd":"bunx turbo run dev"}]}]}`)
	ctx := newContext(t, fake, modtest.Secrets{"tunnel_secret": secret})

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	local := string(fake.Files[registry.DefaultLocal])

	for _, want := range []string{`"hostname": "shop.` + domain + `"`, `"hostname": "api-shop.` + domain + `"`} {
		if !strings.Contains(local, want) {
			t.Errorf("registry lacks %s:\n%s", want, local)
		}
	}

	if strings.Contains(local, "old.example") {
		t.Fatalf("a name under the old domain stayed:\n%s", local)
	}

	ingress := string(fake.Files[cloudflared.ConfigPath])
	if !strings.Contains(ingress, "hostname: shop."+domain) || strings.Contains(ingress, "old.example") {
		t.Fatalf("the ingress must carry the new names only:\n%s", ingress)
	}

	if fake.EnvValue(env.DomainKey) != domain {
		t.Fatalf("%s = %q", env.DomainKey, fake.EnvValue(env.DomainKey))
	}

	moved := false

	for _, event := range ctx.Events() {
		if event.Step == "move-routes" {
			moved = event.Status == contract.StepOK
		}
	}

	if !moved {
		t.Fatal("the move is a step of its own, so the report says it happened")
	}
}

func TestTheTunnelOfThePlatformIsRunNotCreated(t *testing.T) {
	fake := equipped(t)

	if got := string(fake.Files[cloudflared.CredentialsPath]); !strings.Contains(got, tunnel) || !strings.Contains(got, account) {
		t.Fatalf("credentials = %s", got)
	}

	ingress := string(fake.Files[cloudflared.ConfigPath])
	if !strings.Contains(ingress, label+"."+domain) || !strings.Contains(ingress, "http://web.localhost:3000") {
		t.Fatalf("ingress = %s", ingress)
	}

	if strings.Contains(ingress, "api.localhost") {
		t.Fatal("a project without a subdomain has no public route")
	}

	if fake.EnvValue(env.DomainKey) != domain {
		t.Fatalf("%s = %q", env.DomainKey, fake.EnvValue(env.DomainKey))
	}

	if fake.Units[Unit] != modtest.UnitActive {
		t.Fatalf("cloudflared = %q", fake.Units[Unit])
	}
}

func TestNoStepCallsTheCloudflareApi(t *testing.T) {
	fake := equipped(t)

	for _, command := range fake.Commands() {
		if strings.Contains(command, "api.cloudflare.com") {
			t.Fatalf("the module called the Cloudflare API: %s", command)
		}
	}
}

func TestInstallAndConfigureAreIdempotent(t *testing.T) {
	fake := equipped(t)
	before := fake.Restarts[Unit]

	ctx := newContext(t, fake, modtest.Secrets{"tunnel_secret": secret})
	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	// verify-tunnel runs on every pass: a tunnel Cloudflare dropped since is exactly what a replay must find.
	for _, event := range ctx.Events() {
		if event.Step != "verify-tunnel" && event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}

	if fake.Restarts[Unit] != before {
		t.Fatalf("cloudflared restarted on a configured machine")
	}
}

func TestSyncFollowsTheRegistry(t *testing.T) {
	fake := equipped(t)
	fake.Files[registry.DefaultConf] = []byte(projects + "docs|flyleaf/apps/docs|-|bun|docs.localhost|3002|renard-calme-1122|bun run docs\n")

	report, err := Sync(newContext(t, fake, nil))
	if err != nil {
		t.Fatal(err)
	}

	if len(report.Routes) != 2 || report.Routes[1].Hostname != "renard-calme-1122."+domain {
		t.Fatalf("routes = %+v", report.Routes)
	}

	if !strings.Contains(string(fake.Files[cloudflared.ConfigPath]), "renard-calme-1122."+domain) {
		t.Fatal("the new route must reach the ingress")
	}
}

func TestUninstallGivesBackTheMachineOnly(t *testing.T) {
	fake := equipped(t)

	if err := (Module{}).Uninstall(newContext(t, fake, nil)); err != nil {
		t.Fatal(err)
	}

	for _, path := range []string{cloudflared.ConfigPath, cloudflared.CredentialsPath, cloudflared.UnitPath, cloudflared.SourcePath, cloudflared.KeyringPath, modePath} {
		if _, left := fake.Files[path]; left {
			t.Errorf("%s survived the uninstall", path)
		}
	}

	if fake.EnvValue(env.DomainKey) != "" {
		t.Error("the domain must be forgotten with the module")
	}

	for _, command := range fake.Commands() {
		if strings.Contains(command, "api.cloudflare.com") {
			t.Fatalf("the uninstall must not touch the account: %s", command)
		}
	}
}

func TestUninstallKeepsTheDomainOfTheExposureThatHoldsTheMachine(t *testing.T) {
	fake := equipped(t)
	fake.Files[modePath] = routes.Marker("caddy")
	fake.Files[env.Path] = []byte(env.DomainKey + "=caddy.example.org\n")

	if err := (Module{}).Uninstall(newContext(t, fake, nil)); err != nil {
		t.Fatal(err)
	}

	if fake.EnvValue(env.DomainKey) != "caddy.example.org" {
		t.Fatalf("the domain Caddy holds must stay, env:\n%s", fake.Files[env.Path])
	}

	if string(fake.Files[modePath]) != "caddy\n" {
		t.Fatalf("the marker belongs to caddy: %q", fake.Files[modePath])
	}
}

func TestAMachineOfTheOtherExposureIsNotOurs(t *testing.T) {
	fake := bareMachine()
	fake.Packages[cloudflared.Pkg] = "2026.6.1"

	status, err := (Module{}).Status(newContext(t, fake, nil))
	if err != nil || status.Installed {
		t.Fatalf("status = %+v, %v", status, err)
	}
}

func TestTheManifestSeparatesWhatIsDerivedFromWhatIsChosen(t *testing.T) {
	if manifest().Connection != contract.ConnectionCloudflare {
		t.Fatalf("connection = %q, want %q", manifest().Connection, contract.ConnectionCloudflare)
	}

	managed := []string{}

	for _, field := range manifest().Fields {
		if field.Managed {
			managed = append(managed, field.Key)
			continue
		}

		if field.Key != "domain" {
			t.Errorf("%s is neither derived nor the domain", field.Key)
		}

		if field.Format != contract.FormatDomain || !field.Required {
			t.Errorf("the domain is a required domain, got format %q required %v", field.Format, field.Required)
		}
	}

	if !reflect.DeepEqual(managed, []string{"account_tag", "tunnel_id", "tunnel_secret"}) {
		t.Fatalf("derived fields = %v", managed)
	}
}

func TestTheMissingTunnelSecretIsRefusedByTheContract(t *testing.T) {
	held := func(string, string) []string { return nil }

	for _, field := range manifest().Fields {
		if field.Kind != contract.FieldSecret {
			continue
		}

		problem := contract.ValidateField(ID, field, nil, held)
		if problem == nil || problem.Code != contract.ProblemRequired {
			t.Fatalf("%s: problem = %+v", field.Key, problem)
		}
	}
}

func TestTheSecretNeverLeaves(t *testing.T) {
	fake := bareMachine()
	ctx := newContext(t, fake, modtest.Secrets{"tunnel_secret": secret})

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	for _, line := range ctx.Output() {
		if strings.Contains(line, secret) {
			t.Fatalf("secret in output: %s", line)
		}
	}
}

var _ modules.Module = Module{}

func TestAStartThatNeverComesUpNamesWhatTheDaemonSaid(t *testing.T) {
	fake := equipped(t)
	fake.Files[registry.DefaultConf] = []byte(projects + "shop|flyleaf/apps/shop|-|bun|shop.localhost|3002|-|bun run shop\n")
	fake.FailProgram("systemctl", "Job for cloudflared.service failed because a timeout was exceeded.")
	fake.Answer("journalctl", `ERR Register tunnel error from server side error="Unauthorized: Tunnel not found"`)
	ctx := newContext(t, fake, modtest.Secrets{"tunnel_secret": secret})

	err := (Module{}).Configure(ctx)
	if err == nil {
		t.Fatal("a unit that will not come up must fail the step")
	}

	if !strings.Contains(err.Error(), i18n.T("cloudflared.tunnel.unknown")) {
		t.Fatalf("the step must name the cause: %v", err)
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Step != "enable-service" || last.Status != contract.StepFail {
		t.Fatalf("unexpected event: %+v", last)
	}
}

func TestATunnelCloudflareDroppedIsRefused(t *testing.T) {
	fake := equipped(t)
	fake.Units[Unit] = modtest.UnitInactive
	fake.Answer("journalctl", `ERR Register tunnel error from server side error="Unauthorized: Tunnel not found"`)

	err := cloudflared.Registered(newContext(t, fake, modtest.Secrets{}))
	if err == nil || !strings.Contains(err.Error(), i18n.T("cloudflared.tunnel.unknown")) {
		t.Fatalf("a tunnel the account no longer holds must be refused, and say so: %v", err)
	}
}

func TestATunnelThatRegisteredAfterTheRefusalIsAccepted(t *testing.T) {
	fake := equipped(t)
	fake.Units[Unit] = modtest.UnitInactive
	fake.Answer("journalctl", `ERR Register tunnel error from server side error="Unauthorized: Tunnel not found"
INF Registered tunnel connection connIndex=0 location=mrs04 protocol=quic`)

	if err := cloudflared.Registered(newContext(t, fake, modtest.Secrets{})); err != nil {
		t.Fatalf("a tunnel that registered after the refusal must be accepted: %v", err)
	}
}

func TestATunnelRefusedAfterItRegisteredIsStillRefused(t *testing.T) {
	fake := equipped(t)
	fake.Units[Unit] = modtest.UnitInactive
	fake.Answer("journalctl", `INF Registered tunnel connection connIndex=0 location=mrs04 protocol=quic
ERR Register tunnel error from server side error="Unauthorized: Tunnel not found"`)

	err := cloudflared.Registered(newContext(t, fake, modtest.Secrets{}))
	if err == nil || !strings.Contains(err.Error(), i18n.T("cloudflared.tunnel.unknown")) {
		t.Fatalf("a tunnel refused after it registered must still be refused: %v", err)
	}
}

func TestTheUnitLetsTheTunnelReachAnEdgeThatDoesNotKnowItYet(t *testing.T) {
	if !strings.Contains(string(cloudflared.UnitFile), "TimeoutStartSec=150") {
		t.Fatalf("unit = %s", cloudflared.UnitFile)
	}
}

func TestATunnelTheEdgeTookIsAcceptedWhateverItSaidFirst(t *testing.T) {
	fake := equipped(t)
	fake.Units[Unit] = modtest.UnitActive
	fake.Answer("journalctl", `INF Registered tunnel connection connIndex=0 location=mrs07 protocol=quic
ERR Register tunnel error from server side error="Unauthorized: Tunnel not found" connIndex=1`)

	if err := cloudflared.Registered(newContext(t, fake, modtest.Secrets{})); err != nil {
		t.Fatalf("a unit systemd calls active carries the tunnel: %v", err)
	}
}

func TestCredentialsRewrittenOnARunningDaemonRestartIt(t *testing.T) {
	fake := equipped(t)
	fake.Files[cloudflared.CredentialsPath] = []byte("{}\n")
	ctx := newContext(t, fake, modtest.Secrets{"tunnel_secret": secret})

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	if !restarted(ctx) {
		t.Fatal("the daemon must be restarted on credentials it has not read")
	}
}

func restarted(ctx *modules.Context) bool {
	for _, event := range ctx.Events() {
		if event.Step == "enable-service" {
			return event.Status != contract.StepSkip
		}
	}

	return false
}

func TestATunnelThatHasNotConnectedYetOnlyWarns(t *testing.T) {
	fake := equipped(t)
	fake.Units[Unit] = modtest.UnitInactive
	fake.Answer("journalctl", `INF Retrying connection in up to 16s connIndex=0`)
	ctx := newContext(t, fake, modtest.Secrets{"tunnel_secret": secret})

	serving, said := cloudflared.Serving(ctx)
	if serving || !strings.Contains(said, "Retrying connection") {
		t.Fatalf("serving = %v, said = %q", serving, said)
	}

	if err := cloudflared.Registered(ctx); err != nil {
		t.Fatalf("only a tunnel Cloudflare dropped is refused: %v", err)
	}
}

func TestATunnelThatOpenedAConnectionIsServing(t *testing.T) {
	fake := equipped(t)
	fake.Units[Unit] = modtest.UnitInactive
	fake.Answer("journalctl", `INF Registered tunnel connection connIndex=0 location=cdg07`)

	serving, _ := cloudflared.Serving(newContext(t, fake, modtest.Secrets{"tunnel_secret": secret}))
	if !serving {
		t.Fatal("a tunnel that registered a connection carries something")
	}
}

func TestATunnelThatServesIsAccepted(t *testing.T) {
	fake := equipped(t)

	if err := cloudflared.Registered(newContext(t, fake, modtest.Secrets{})); err != nil {
		t.Fatalf("an active unit must pass: %v", err)
	}
}

func TestTheTunnelAndTheAccountAreRefusedUnlessTheyAreWhatCloudflareIssues(t *testing.T) {
	held := func(string, string) []string { return []string{secret} }

	if problems := contract.ValidateModule(manifest(), map[string]any{"account_tag": account, "tunnel_id": tunnel, "domain": domain}, held); len(problems) != 0 {
		t.Fatalf("what Cloudflare issues must pass: %+v", problems)
	}

	for field, value := range map[string]string{
		"account_tag": "acc-1234",
		"tunnel_id":   tunnel + "\ncredentials-file: /etc/shadow",
	} {
		config := map[string]any{"account_tag": account, "tunnel_id": tunnel, "domain": domain}
		config[field] = value

		problems := contract.ValidateModule(manifest(), config, held)
		if len(problems) != 1 || problems[0].Field != field || problems[0].Code != contract.ProblemPattern {
			t.Errorf("%s = %q: problems = %+v", field, value, problems)
		}
	}
}

func TestTheExposureMarkerIsRootsAlone(t *testing.T) {
	fake := equipped(t)

	if fake.Modes[modePath] != 0o600 {
		t.Fatalf("%s mode = %o, want 0600", modePath, fake.Modes[modePath])
	}

	fake.Modes[modePath] = 0o644
	if err := (Module{}).Configure(newContext(t, fake, modtest.Secrets{"tunnel_secret": secret})); err != nil {
		t.Fatal(err)
	}

	if fake.Modes[modePath] != 0o600 {
		t.Fatalf("a marker left readable by an older agent must be closed on the next pass: %o", fake.Modes[modePath])
	}
}
