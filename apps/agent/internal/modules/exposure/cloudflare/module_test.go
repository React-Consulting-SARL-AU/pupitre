package cloudflare

import (
	"reflect"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure/cloudflared"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys/env"
)

const (
	account = "acc-1234"
	tunnel  = "t-1234"
	secret  = "s3cret-de-test"
	domain  = "pupitre.sh"
	label   = "hibou-tranquille-4821"
)

const projects = `web|flymate/apps/web|-|bun|web.localhost|3000|` + label + `|bun run dev
api|flymate/apps/api|-|bun|api.localhost|3001|-|bun run api
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

// Everything the account can do is done by the platform: the server holds a secret that runs one tunnel, and nothing else.
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

	// verify-tunnel reads what the daemon says of itself: it changes nothing,
	// and it runs on every pass because a tunnel Cloudflare dropped since the
	// last one is exactly what a replay is there to find.
	for _, event := range ctx.Events() {
		if event.Step != "verify-tunnel" && event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}

	if fake.Restarts[Unit] != before {
		t.Fatalf("cloudflared restarted on a configured machine")
	}
}

// A new project takes its route without touching anything else: the app declares the subdomain, sync writes the ingress.
func TestSyncFollowsTheRegistry(t *testing.T) {
	fake := equipped(t)
	fake.Files[registry.DefaultConf] = []byte(projects + "docs|flymate/apps/docs|-|bun|docs.localhost|3002|renard-calme-1122|bun run docs\n")

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

// The tunnel, its DNS and the label belong to the platform: the machine gives itself back, and the account keeps everything.
func TestUninstallGivesBackTheMachineOnly(t *testing.T) {
	fake := equipped(t)

	if err := (Module{}).Uninstall(newContext(t, fake, nil)); err != nil {
		t.Fatal(err)
	}

	for _, path := range []string{cloudflared.ConfigPath, cloudflared.CredentialsPath, cloudflared.UnitPath, modePath} {
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

// The daemon alone proves nothing: a machine held by exposure.cloudflare must not answer for this module.
func TestAMachineOfTheOtherExposureIsNotOurs(t *testing.T) {
	fake := bareMachine()
	fake.Packages[cloudflared.Pkg] = "2026.6.1"

	status, err := (Module{}).Status(newContext(t, fake, nil))
	if err != nil || status.Installed {
		t.Fatalf("status = %+v, %v", status, err)
	}
}

// The engine refuses a configuration before the first step, so the module never
// sees a missing credential. What this module owes is the declaration it is
// refused on: three values the app derives, and one domain the client chooses.
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
	held := func(string, string) int { return 0 }

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

// systemctl only ever says the job failed; what the client can act on is in the daemon's own journal.
func TestAStartThatNeverComesUpNamesWhatTheDaemonSaid(t *testing.T) {
	fake := equipped(t)
	fake.Files[registry.DefaultConf] = []byte(projects + "shop|flymate/apps/shop|-|bun|shop.localhost|3002|-|bun run shop\n")
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

// cloudflared answers systemd that it started long before it knows whether the
// tunnel is still there, so the step asks the machine rather than the command.
func TestATunnelCloudflareDroppedIsRefused(t *testing.T) {
	fake := equipped(t)
	fake.Units[Unit] = modtest.UnitInactive
	fake.Answer("journalctl", `ERR Register tunnel error from server side error="Unauthorized: Tunnel not found"`)

	err := cloudflared.Registered(newContext(t, fake, modtest.Secrets{}))
	if err == nil || !strings.Contains(err.Error(), i18n.T("cloudflared.tunnel.unknown")) {
		t.Fatalf("a tunnel the account no longer holds must be refused, and say so: %v", err)
	}
}

// A tunnel that has not connected yet is not a failed install: the machine may
// be a second away from it, and the step says so rather than refusing.
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

// The daemon says it carries a connection long before systemd is asked about it.
func TestATunnelThatOpenedAConnectionIsServing(t *testing.T) {
	fake := equipped(t)
	fake.Units[Unit] = modtest.UnitInactive
	fake.Answer("journalctl", `INF Registered tunnel connection connIndex=0 location=cdg07`)

	serving, _ := cloudflared.Serving(newContext(t, fake, modtest.Secrets{"tunnel_secret": secret}))
	if !serving {
		t.Fatal("a tunnel that registered a connection carries something")
	}
}

// A tunnel that serves is a unit systemd calls active, and nothing else is asked of it.
func TestATunnelThatServesIsAccepted(t *testing.T) {
	fake := equipped(t)

	if err := cloudflared.Registered(newContext(t, fake, modtest.Secrets{})); err != nil {
		t.Fatalf("an active unit must pass: %v", err)
	}
}
