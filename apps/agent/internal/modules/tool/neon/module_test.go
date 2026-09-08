package neon

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
)

const key = "napi_s3cret-de-test"

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{
		Manifest: manifest(),
		Secrets:  modtest.Secrets{"api_key": key},
	})
}

func machine() *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Answer("neon --version", "2.27.0\n")

	return fake
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

func TestTheCliLandsAndTheKeyIsStored(t *testing.T) {
	fake := machine()
	ctx := newContext(t, fake)

	run(t, ctx)

	commands := strings.Join(fake.Commands(), "\n")
	if !strings.Contains(commands, "neonctl-linux-") {
		t.Fatalf("the CLI was never downloaded:\n%s", commands)
	}

	if _, posed := fake.Files[BinaryPath]; !posed {
		t.Fatalf("no binary at %s", BinaryPath)
	}

	if fake.EnvValue(keyKey) != key {
		t.Fatalf("%s = %q", keyKey, fake.EnvValue(keyKey))
	}

	status, err := (Module{}).Status(ctx)
	if err != nil || !status.Installed || !status.Configured || status.Version != "2.27.0" {
		t.Fatalf("status = %+v, %v", status, err)
	}

	if err := contract.ValidateValue("ServiceStatusResult", status.Service(manifest())); err != nil {
		t.Fatal(err)
	}
}

// The module poses a CLI and authenticates it; what the client does with his account is not its business.
func TestNoStepTalksToTheNeonConsole(t *testing.T) {
	fake := machine()
	ctx := newContext(t, fake)

	run(t, ctx)
	if err := (Module{}).Upgrade(ctx); err != nil {
		t.Fatal(err)
	}

	for _, command := range fake.Commands() {
		if strings.Contains(command, "console.neon.tech") {
			t.Fatalf("the module called the Neon API: %s", command)
		}
	}
}

func TestKeyNeverLeaves(t *testing.T) {
	fake := machine()
	ctx := newContext(t, fake)

	run(t, ctx)

	for _, line := range ctx.Output() {
		if strings.Contains(line, key) {
			t.Fatalf("secret in output: %s", line)
		}
	}
}

func TestReplayOnAnEquippedMachineChangesNothing(t *testing.T) {
	fake := machine()
	run(t, newContext(t, fake))

	ctx := newContext(t, fake)
	run(t, ctx)

	for step, status := range statuses(ctx) {
		if status != contract.StepSkip {
			t.Errorf("replay: %s = %s, want skip", step, status)
		}
	}
}

// A server equipped by an earlier version carries connection strings the module no longer writes: they go too.
func TestUninstallForgetsEveryNeonKey(t *testing.T) {
	fake := machine()
	ctx := newContext(t, fake)

	run(t, ctx)

	if err := fake.WriteFile("/etc/pupitre/env", []byte(keyKey+"="+key+"\nNEON_WEB_DATABASE_URL=postgresql://x\nGITHUB_TOKEN=gh\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := (Module{}).Uninstall(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	for _, line := range strings.Split(string(fake.Files["/etc/pupitre/env"]), "\n") {
		if strings.HasPrefix(line, keyPrefix) {
			t.Fatalf("a Neon key survived: %s", line)
		}
	}

	if fake.EnvValue("GITHUB_TOKEN") != "gh" {
		t.Fatal("the other keys of the machine are not ours to remove")
	}

	if _, posed := fake.Files[BinaryPath]; posed {
		t.Fatal("the binary must go with the module")
	}
}

// The engine refuses a configuration before the first step, so the module never
// sees a missing secret. What this module owes is the declaration it is refused on.
func TestTheSecretIsRequiredByTheContract(t *testing.T) {
	held := func(string, string) int { return 0 }

	for _, field := range manifest().Fields {
		if field.Key != "api_key" {
			continue
		}

		problem := contract.ValidateField(ID, field, nil, held)
		if problem == nil || problem.Code != contract.ProblemRequired {
			t.Fatalf("problem = %+v", problem)
		}

		if problem.Message == "" {
			t.Fatal("a refusal says what is wrong")
		}

		return
	}

	t.Fatalf("the manifest declares no api_key field")
}

var _ modules.Module = Module{}
