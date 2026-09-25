package ruby

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/shell"
)

var values = modtest.Values{"ruby_versions": []string{"3.4"}, "bundler": true}

func newContext(t *testing.T, fake *modtest.FakeSys, chosen modtest.Values) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Values: chosen})
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

func TestInstallBringsTheHeadersThenRubyAndBundler(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, values)

	run(t, ctx)

	commands := strings.Join(fake.Commands(), "\n")

	for _, want := range []string{"libyaml-dev", "(dev) mise use -g -y ruby@3.4", "(dev) gem install bundler --no-document"} {
		if !strings.Contains(commands, want) {
			t.Errorf("command %q not run:\n%s", want, commands)
		}
	}

	env := string(fake.Files[shell.EnvPath])
	if !strings.Contains(env, `export PATH="$HOME/.bundle/bin:$PATH"`) {
		t.Fatalf(".zshenv lacks the bundler binaries:\n%s", env)
	}

	status, err := (Module{}).Status(ctx)
	if err != nil || !status.Installed || status.Version != "ruby 3.4" {
		t.Fatalf("status = %+v, %v", status, err)
	}

	if err := contract.ValidateValue("ServiceStatusResult", status.Service(manifest())); err != nil {
		t.Fatal(err)
	}
}

func TestBundlerIsSkippedWhenNotAskedFor(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, modtest.Values{"ruby_versions": []string{"3.3"}, "bundler": false})

	run(t, ctx)

	if statuses(ctx)["install-bundler"] != contract.StepSkip {
		t.Fatalf("steps = %v", statuses(ctx))
	}
}

func TestBundlerFailureOnlyWarns(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailProgram("gem", "ERROR: While executing gem ... (Gem::FilePermissionError)")
	ctx := newContext(t, fake, values)

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	if statuses(ctx)["install-bundler"] != contract.StepOK {
		t.Fatalf("steps = %v", statuses(ctx))
	}
}

func TestReplayOnAnInstalledMachineChangesNothing(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, values))

	mutations := len(fake.Mutations)
	ctx := newContext(t, fake, values)
	run(t, ctx)

	for step, status := range statuses(ctx) {
		if status != contract.StepSkip {
			t.Errorf("replay: %s = %s, want skip", step, status)
		}
	}

	if len(fake.Mutations) != mutations {
		t.Fatalf("replay wrote to the machine: %v", fake.Mutations[mutations:])
	}
}

func TestFailedStepReportsItsReplayCommand(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailPackage("libyaml-dev", "E: Unable to locate package libyaml-dev")
	ctx := newContext(t, fake, values)

	if err := (Module{}).Install(ctx); err == nil {
		t.Fatal("expected install to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only=runtime.ruby" {
		t.Fatalf("unexpected event: %+v", last)
	}
}

var _ modules.Module = Module{}

func TestUpgradeRefreshesBundlerUnderTheNewPatch(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, values))
	installs := strings.Count(strings.Join(fake.Commands(), "\n"), "mise x ruby@3.4 -- gem install bundler")
	fake.Upgrades["mise:ruby@3.4"] = "3.4.5"

	ctx := newContext(t, fake, values)
	if err := (Module{}).Upgrade(ctx); err != nil {
		t.Fatal(err)
	}

	commands := strings.Join(fake.Commands(), "\n")
	if strings.Count(commands, "mise x ruby@3.4 -- gem install bundler") != installs+1 {
		t.Fatalf("bundler must be installed once more, under ruby 3.4:\n%s", commands)
	}

	again := newContext(t, fake, values)
	if err := (Module{}).Upgrade(again); err != nil {
		t.Fatal(err)
	}

	if statuses(again)["install-bundler"] != contract.StepSkip {
		t.Fatalf("nothing moved, bundler stays: %v", statuses(again))
	}
}
