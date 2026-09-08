package ssh

import (
	"slices"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sys/env"
)

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest()})
}

func TestInstallAndConfigureAreIdempotent(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Packages[pkg] = "1:9.6p1-3"
	fake.Files[modePath] = mode
	ctx := newContext(t, fake)

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

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine: %v", fake.Mutations)
	}
}

// Without a public exposure a project keeps its port, and project.url must stop answering with a subdomain that resolves nowhere.
func TestConfigureClearsTheDomainProjectUrlReads(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Packages[pkg] = "1:9.6p1-3"
	fake.Files[env.Path] = []byte(env.DomainKey + "=flymate.dev\n")
	ctx := newContext(t, fake)

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	if fake.EnvValue(env.DomainKey) != "" {
		t.Fatalf("%s must be gone, project.url would print an address that answers nothing", env.DomainKey)
	}

	if string(fake.Files[modePath]) != string(mode) {
		t.Fatalf("the mode must be declared on the machine, got %q", fake.Files[modePath])
	}
}

func TestTheModuleInstallsNoService(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Packages[pkg] = "1:9.6p1-3"
	ctx := newContext(t, fake)

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	if len(fake.Units) != 0 {
		t.Fatalf("the ssh exposure installs no service: %v", fake.Units)
	}

	status, err := (Module{}).Status(ctx)
	if err != nil {
		t.Fatal(err)
	}

	if status.Unit != "" || len(status.Credentials) != 0 {
		t.Fatalf("no unit and no credential: %+v", status)
	}
}

func TestFailedStepReportsReplay(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailPackage(pkg, "E: Unable to locate package openssh-server")
	ctx := newContext(t, fake)

	if err := (Module{}).Install(ctx); err == nil {
		t.Fatal("expected install to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected event: %+v", last)
	}
}

func TestTheOtherExposuresAreRefused(t *testing.T) {
	conflicts := manifest().Conflicts
	for _, other := range []string{"exposure.cloudflare", "exposure.caddy"} {
		if !slices.Contains(conflicts, other) {
			t.Fatalf("one exposure at a time: %v", conflicts)
		}
	}

	if len(conflicts) != 2 {
		t.Fatalf("one exposure at a time: %v", conflicts)
	}
}

var _ modules.Module = Module{}
