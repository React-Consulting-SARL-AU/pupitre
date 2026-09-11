package hermes

import (
	"regexp"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/mise"
)

const (
	openaiKey    = "sk-openai-" + modtest.Secret
	anthropicKey = "sk-ant-" + modtest.Secret
)

func secrets() modtest.Secrets {
	return modtest.Secrets{
		"providers.0": "openai:" + openaiKey,
		"providers.1": "anthropic:" + anthropicKey,
	}
}

func newContext(t *testing.T, fake *modtest.FakeSys, values modtest.Values) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Values: values, Secrets: secrets()})
}

func install(t *testing.T, fake *modtest.FakeSys, values modtest.Values) *modules.Context {
	t.Helper()

	ctx := newContext(t, fake, values)

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

func TestFirstInstallWritesTheProvidersAndLeavesTheServiceOut(t *testing.T) {
	fake := modtest.NewFakeSys()

	install(t, fake, modtest.Values{"always_on": false})

	if fake.Tools[tool] == "" {
		t.Fatalf("Hermes must be installed by mise: %v", fake.Tools)
	}

	written := string(fake.Files[envPath])
	for _, want := range []string{"HERMES_ANTHROPIC_API_KEY=" + anthropicKey, "HERMES_OPENAI_API_KEY=" + openaiKey} {
		if !strings.Contains(written, want) {
			t.Errorf("%s must carry %s:\n%s", envPath, want, written)
		}
	}

	if fake.Modes[envPath] != 0o600 {
		t.Errorf("%s must be 0600, got %o", envPath, fake.Modes[envPath])
	}

	if fake.EnvValue("HERMES_OPENAI_API_KEY") != openaiKey {
		t.Error("each provider key belongs in /etc/pupitre/env")
	}

	if len(fake.Files[unitPath]) != 0 {
		t.Error("without always_on there is no unit to write")
	}
}

func TestAlwaysOnEnablesTheService(t *testing.T) {
	fake := modtest.NewFakeSys()

	install(t, fake, modtest.Values{"always_on": true})

	unit := string(fake.Files[unitPath])
	if !strings.Contains(unit, "EnvironmentFile="+envPath) || !strings.Contains(unit, "User=dev") {
		t.Fatalf("the unit must read the providers as dev:\n%s", unit)
	}

	if fake.Units[Unit] != modtest.UnitActive {
		t.Fatalf("the unit must be active, got %q", fake.Units[Unit])
	}
}

func TestReplayMutatesNothing(t *testing.T) {
	fake := modtest.NewFakeSys()
	install(t, fake, modtest.Values{"always_on": true})

	fake.Mutations = nil
	ctx := install(t, fake, modtest.Values{"always_on": true})

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine:\n  %s", strings.Join(fake.Mutations, "\n  "))
	}

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}
}

func TestProviderKeysNeverLeak(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := install(t, fake, modtest.Values{"always_on": true})

	for _, line := range ctx.Output() {
		for _, key := range []string{openaiKey, anthropicKey} {
			if strings.Contains(line, key) {
				t.Fatalf("a provider key reached the journal: %s", line)
			}
		}
	}

	for _, event := range ctx.Events() {
		rendered := event.Module + event.Step + event.Replay
		for _, key := range []string{openaiKey, anthropicKey} {
			if strings.Contains(rendered, key) {
				t.Fatalf("a provider key reached an event: %+v", event)
			}
		}
	}

	status, err := (Module{}).Status(newContext(t, fake, modtest.Values{"always_on": true}))
	if err != nil {
		t.Fatal(err)
	}

	for label, value := range status.Credentials {
		if strings.Contains(value, "sk-") || strings.Contains(label, "sk-") {
			t.Fatalf("credentials name the env keys, never their values: %v", status.Credentials)
		}
	}

	if status.Credentials["HERMES_OPENAI_API_KEY"] != "HERMES_OPENAI_API_KEY" {
		t.Fatalf("the env keys must be reported: %v", status.Credentials)
	}
}

// The shape of an entry is the manifest's to state and the form's to hold; the module no longer reads its own field twice.
func TestTheManifestHoldsEachProviderToItsShape(t *testing.T) {
	var providers contract.Field
	for _, field := range manifest().Fields {
		if field.Key == "providers" {
			providers = field
		}
	}

	shape, err := regexp.Compile(providers.Pattern)
	if err != nil || providers.Pattern == "" {
		t.Fatalf("providers pattern = %q: %v", providers.Pattern, err)
	}

	for entry, accepted := range map[string]bool{"openai:sk-abc": true, "Anthropic:key with spaces": true, "sans-separateur": false, ":nokey": false, "novalue:": false} {
		if shape.MatchString(entry) != accepted {
			t.Errorf("%q accepted = %v, want %v", entry, !accepted, accepted)
		}
	}
}

func TestUninstallForgetsTheProvidersAndTheService(t *testing.T) {
	fake := modtest.NewFakeSys()
	install(t, fake, modtest.Values{"always_on": true})

	if err := (Module{}).Uninstall(newContext(t, fake, modtest.Values{"always_on": true})); err != nil {
		t.Fatal(err)
	}

	if len(fake.Files[unitPath]) != 0 || len(fake.Files[envPath]) != 0 {
		t.Error("the unit and the providers file must go")
	}

	if fake.EnvValue("HERMES_OPENAI_API_KEY") != "" || fake.Tools[tool] != "" {
		t.Error("the env keys and the CLI must go")
	}
}

func TestFailedInstallCarriesItsReplayCommand(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[mise.Path] = []byte("mise")
	fake.FailProgram("mise", "mise: pipx backend unavailable")

	err := (Module{}).Install(newContext(t, fake, nil))
	if err == nil {
		t.Fatal("expected the install to fail")
	}

	step, ok := err.(*modules.StepError)
	if !ok || step.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected error: %#v", err)
	}
}

var _ modules.Module = Module{}
