package rust

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/modules/runtime/shell"
)

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Values: modtest.Values{"rust_versions": []string{"1.98"}}})
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

func TestInstallPutsRustAndCargoBinariesOnPath(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake)

	run(t, ctx)

	if !strings.Contains(strings.Join(fake.Commands(), "\n"), "(dev) mise use -g -y rust@1.98") {
		t.Fatalf("rust not installed:\n%s", strings.Join(fake.Commands(), "\n"))
	}

	env := string(fake.Files[shell.EnvPath])

	for _, want := range []string{
		`export PATH="$HOME/.cargo/bin:$PATH"`,
		`export PATH="$HOME/.local/share/mise/shims:$PATH"`,
	} {
		if !strings.Contains(env, want) {
			t.Errorf(".zshenv lacks %q:\n%s", want, env)
		}
	}

	status, err := (Module{}).Status(ctx)
	if err != nil {
		t.Fatal(err)
	}

	if !status.Installed || !status.Configured || !strings.HasPrefix(status.Version, "rust 1.98") {
		t.Fatalf("status = %+v", status)
	}
}

func TestReplayMutatesNothing(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake))

	fake.Mutations = nil
	ctx := newContext(t, fake)
	run(t, ctx)

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine:\n  %s", strings.Join(fake.Mutations, "\n  "))
	}

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}
}

func TestUninstallTakesBackTheToolchainAndThePath(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake))

	if err := (Module{}).Uninstall(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if fake.Tools["rust"] != "" || len(fake.Versions["rust"]) != 0 || strings.Contains(string(fake.Files[shell.EnvPath]), ID) {
		t.Fatal("the toolchain and the path block must go")
	}
}

func TestFailedInstallCarriesItsReplayCommand(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[mise.Path] = []byte("mise")
	fake.FailProgram("mise", "mise: rustup unreachable")

	err := (Module{}).Install(newContext(t, fake))
	if err == nil {
		t.Fatal("expected the install to fail")
	}

	step, ok := err.(*modules.StepError)
	if !ok || step.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected error: %#v", err)
	}
}

var _ modules.Module = Module{}
