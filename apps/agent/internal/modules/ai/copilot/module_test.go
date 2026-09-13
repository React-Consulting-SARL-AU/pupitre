package copilot

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/ai/agents"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/mise"
)

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest()})
}

func install(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	ctx := newContext(t, fake)

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	for _, event := range ctx.Events() {
		if event.Status == contract.StepFail {
			t.Fatalf("step %s failed", event.Step)
		}
	}

	return ctx
}

func TestFirstInstallLaysDownTheCliTheContextAndTheSkills(t *testing.T) {
	fake := modtest.NewFakeSys()

	install(t, fake)

	if fake.Tools[tool] == "" {
		t.Fatalf("the CLI must be installed by mise: %v", fake.Tools)
	}

	context := string(fake.Files[configDir+"/copilot-instructions.md"])
	if !strings.Contains(context, agents.ProjectsDir) || !strings.Contains(context, agents.SkillsDir) {
		t.Fatalf("the machine context must name the folders:\n%s", context)
	}

	for _, path := range []string{
		agents.SkillsDir + "/capture/SKILL.md",
		configDir + "/skills/ship/SKILL.md",
	} {
		if len(fake.Files[path]) == 0 {
			t.Errorf("%s was not laid down", path)
		}
	}

	status, err := (Module{}).Status(newContext(t, fake))
	if err != nil {
		t.Fatal(err)
	}

	if !status.Installed || !status.Configured {
		t.Fatalf("status = %+v", status)
	}
}

func TestReplayMutatesNothing(t *testing.T) {
	fake := modtest.NewFakeSys()
	install(t, fake)

	fake.Mutations = nil
	ctx := install(t, fake)

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine:\n  %s", strings.Join(fake.Mutations, "\n  "))
	}

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}
}

func TestUninstallKeepsWhatTheClientHolds(t *testing.T) {
	fake := modtest.NewFakeSys()
	install(t, fake)
	fake.Files[configDir+"/config.json"] = []byte("{}")

	if err := (Module{}).Uninstall(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if fake.Tools[tool] != "" {
		t.Fatal("the CLI must go")
	}

	if _, kept := fake.Files[configDir+"/copilot-instructions.md"]; kept {
		t.Fatal("the context this module wrote must go")
	}

	if _, kept := fake.Files[configDir+"/config.json"]; !kept {
		t.Fatalf("%s is the client's", configDir+"/config.json")
	}
}

func TestFailedInstallCarriesItsReplayCommand(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[mise.Path] = []byte("mise")
	fake.FailProgram("mise", "mise: npm backend unavailable")

	err := (Module{}).Install(newContext(t, fake))
	if err == nil {
		t.Fatal("expected the install to fail")
	}

	step, ok := err.(*modules.StepError)
	if !ok || step.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected error: %#v", err)
	}
}

// Neither CLI answers who holds the session without spending a request, so the module reports no account rather than guessing from a file.
func TestTheModuleReportsNoAccount(t *testing.T) {
	if _, asks := modules.Module(Module{}).(modules.Account); asks {
		t.Fatal("the module must not claim an account check it cannot make")
	}
}

var _ modules.Module = Module{}
