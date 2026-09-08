package golang

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/shell"
)

func newContext(t *testing.T, fake *modtest.FakeSys, values modtest.Values) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Values: values})
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

func TestInstallPutsGoAndItsBinariesOnPath(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, modtest.Values{"go_version": "1.25"})

	run(t, ctx)

	if !strings.Contains(strings.Join(fake.Commands(), "\n"), "(dev) mise use -g -y go@1.25") {
		t.Fatalf("go not installed:\n%s", strings.Join(fake.Commands(), "\n"))
	}

	env := string(fake.Files[shell.EnvPath])
	for _, want := range []string{
		`export GOPATH="$HOME/go"`,
		`export PATH="$HOME/go/bin:$PATH"`,
		`export PATH="$HOME/.local/share/mise/shims:$PATH"`,
	} {
		if !strings.Contains(env, want) {
			t.Errorf(".zshenv lacks %q:\n%s", want, env)
		}
	}

	status, err := (Module{}).Status(ctx)
	if err != nil || !status.Installed || !status.Configured || status.Version != "go 1.25" {
		t.Fatalf("status = %+v, %v", status, err)
	}

	if err := contract.ValidateValue("ServiceStatusResult", status.Service(manifest())); err != nil {
		t.Fatal(err)
	}
}

func TestChosenGopathReachesTheShell(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, modtest.Values{"go_version": "1.25", "gopath": "/srv/go"})

	run(t, ctx)

	env := string(fake.Files[shell.EnvPath])
	if !strings.Contains(env, `export GOPATH="/srv/go"`) || !strings.Contains(env, `export PATH="/srv/go/bin:$PATH"`) {
		t.Fatalf(".zshenv keeps the default GOPATH:\n%s", env)
	}
}

func TestReplayOnAnInstalledMachineChangesNothing(t *testing.T) {
	fake := modtest.NewFakeSys()
	values := modtest.Values{"go_version": "1.25"}
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
	fake.FailProgram("curl", "curl: (6) Could not resolve host: mise.jdx.dev")
	ctx := newContext(t, fake, modtest.Values{"go_version": "1.25"})

	if err := (Module{}).Install(ctx); err == nil {
		t.Fatal("expected install to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only=runtime.go" {
		t.Fatalf("unexpected event: %+v", last)
	}
}

var _ modules.Module = Module{}
