package docker

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/shell"
)

var values = modtest.Values{"compose": true}

func newContext(t *testing.T, fake *modtest.FakeSys, chosen modtest.Values) *modules.Context {
	t.Helper()

	fake.Users[shell.User] = "/home/dev"

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

func TestInstallAddsTheRepositoryThenTheEngine(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, values)

	run(t, ctx)

	source := string(fake.Files[sourcePath])
	if !strings.Contains(source, "https://download.docker.com/linux/ubuntu") || !strings.Contains(source, keyringPath) {
		t.Fatalf("apt source = %q", source)
	}

	for _, pkg := range []string{enginePkg, composePkg, buildxPkg} {
		if fake.Packages[pkg] == "" {
			t.Errorf("%s not installed", pkg)
		}
	}

	config := string(fake.Files[configPath])
	if !strings.Contains(config, `"max-size": "10m"`) || strings.Contains(config, "data-root") {
		t.Fatalf("daemon.json = %s", config)
	}

	status, err := (Module{}).Status(ctx)
	if err != nil || !status.Installed || !status.Configured || status.Unit != Unit {
		t.Fatalf("status = %+v, %v", status, err)
	}

	if err := contract.ValidateValue("ServiceStatusResult", status.Service(manifest())); err != nil {
		t.Fatal(err)
	}
}

// Without the group every docker command would need sudo, and the agents that run as dev would stop at the first one.
func TestDevJoinsTheDockerGroupOnce(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, values))

	found := false
	for _, joined := range fake.Groups[shell.User] {
		found = found || joined == group
	}
	if !found {
		t.Fatalf("dev groups = %v", fake.Groups[shell.User])
	}

	ctx := newContext(t, fake, values)
	run(t, ctx)

	if statuses(ctx)["join-docker-group"] != contract.StepSkip {
		t.Fatalf("steps = %v", statuses(ctx))
	}
}

func TestChosenDataRootAndLogSizeReachTheDaemon(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, modtest.Values{"compose": false, "data_root": "/srv/docker", "log_max_size": "50m"})

	run(t, ctx)

	config := string(fake.Files[configPath])
	if !strings.Contains(config, `"data-root": "/srv/docker"`) || !strings.Contains(config, `"max-size": "50m"`) {
		t.Fatalf("daemon.json = %s", config)
	}

	if fake.Packages[composePkg] != "" {
		t.Fatal("compose was not asked for")
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
	fake.FailPackage(enginePkg, "E: Unable to locate package docker-ce")
	ctx := newContext(t, fake, values)

	if err := (Module{}).Install(ctx); err == nil {
		t.Fatal("expected install to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only=runtime.docker" {
		t.Fatalf("unexpected event: %+v", last)
	}
}

var _ modules.Module = Module{}
