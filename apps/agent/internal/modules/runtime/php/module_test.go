package php

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/shell"
)

var values = modtest.Values{"php_version": "8.4", "composer": true}

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

func TestInstallBringsTheHeadersThenPhpAndComposer(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, values)

	run(t, ctx)

	commands := strings.Join(fake.Commands(), "\n")
	for _, want := range []string{"libgd-dev", "libonig-dev", "(dev) mise use -g -y php@8.4", "(dev) composer --version"} {
		if !strings.Contains(commands, want) {
			t.Errorf("command %q not run:\n%s", want, commands)
		}
	}

	if strings.Contains(commands, "composer@latest") {
		t.Errorf("mise no longer carries composer; it must not be traded:\n%s", commands)
	}

	if !strings.Contains(string(fake.Files[iniPath]), "memory_limit = 512M") {
		t.Fatalf("php.ini = %q", fake.Files[iniPath])
	}

	if !strings.Contains(string(fake.Files[shell.EnvPath]), `export PHP_INI_SCAN_DIR=":`+iniDir+`"`) {
		t.Fatalf(".zshenv does not point PHP at the file:\n%s", fake.Files[shell.EnvPath])
	}

	status, err := (Module{}).Status(ctx)
	if err != nil || !status.Installed || status.Version != "php 8.4" {
		t.Fatalf("status = %+v, %v", status, err)
	}

	if err := contract.ValidateValue("ServiceStatusResult", status.Service(manifest())); err != nil {
		t.Fatal(err)
	}
}

func TestComposerIsSkippedWhenNotAskedFor(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, modtest.Values{"php_version": "8.3", "composer": false, "memory_limit": "1G"})

	run(t, ctx)

	if statuses(ctx)["install-composer"] != contract.StepSkip {
		t.Fatalf("steps = %v", statuses(ctx))
	}

	if !strings.Contains(string(fake.Files[iniPath]), "memory_limit = 1G") {
		t.Fatalf("php.ini ignores the chosen limit: %q", fake.Files[iniPath])
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
	fake.FailPackage("libonig-dev", "E: Unable to locate package libonig-dev")
	ctx := newContext(t, fake, values)

	if err := (Module{}).Install(ctx); err == nil {
		t.Fatal("expected install to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only=runtime.php" {
		t.Fatalf("unexpected event: %+v", last)
	}
}

var _ modules.Module = Module{}
