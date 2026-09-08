package cloudflare

import (
	"reflect"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
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

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
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
