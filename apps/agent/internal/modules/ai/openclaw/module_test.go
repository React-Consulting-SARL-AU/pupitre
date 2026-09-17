package openclaw

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/ai/agents"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/mise"
)

const (
	openaiKey    = "sk-openai-s3cret-de-test"
	anthropicKey = "sk-ant-s3cret-de-test"
)

func secrets() modtest.Secrets {
	return modtest.Secrets{"providers.0": "openai:" + openaiKey, "providers.1": "anthropic:" + anthropicKey}
}

func newContext(t *testing.T, fake *modtest.FakeSys, values modtest.Values) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Values: values, Secrets: secrets()})
}

// A machine whose Node is one OpenClaw accepts.
func machine() *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Files[mise.Path] = []byte("mise")
	fake.Tools["node"] = "24.16.0"

	return fake
}

func run(t *testing.T, fake *modtest.FakeSys, values modtest.Values) *modules.Context {
	t.Helper()

	ctx := newContext(t, fake, values)

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	return ctx
}

func TestFirstInstallLaysDownTheGatewayTheProvidersAndTheSkills(t *testing.T) {
	fake := machine()

	ctx := run(t, fake, modtest.Values{"always_on": true})

	if fake.Tools[tool] == "" {
		t.Fatalf("the CLI must be installed by mise: %v", fake.Tools)
	}

	providersFile := string(fake.Files[envPath])
	if !strings.Contains(providersFile, "OPENAI_API_KEY="+openaiKey) || !strings.Contains(providersFile, "ANTHROPIC_API_KEY="+anthropicKey) || fake.Modes[envPath] != 0o600 {
		t.Fatalf("the gateway reads the vendors' own variables from a private file: %q mode %o", providersFile, fake.Modes[envPath])
	}

	if fake.EnvValue("OPENCLAW_OPENAI_API_KEY") != openaiKey {
		t.Fatal("root's file keeps the keys under the module's prefix")
	}

	unit := string(fake.Files[unitPath])
	for _, want := range []string{"gateway --port 18789", "User=dev", "EnvironmentFile=" + envPath, mise.ShimsDir} {
		if !strings.Contains(unit, want) {
			t.Errorf("the unit lacks %q:\n%s", want, unit)
		}
	}

	if fake.Units[Unit] != modtest.UnitActive {
		t.Fatal("the gateway must be enabled")
	}

	if len(fake.Files[configDir+"/skills/server-dev/SKILL.md"]) == 0 || len(fake.Files[agents.SkillsDir+"/ship/SKILL.md"]) == 0 {
		t.Fatal("the skills must be laid down in both folders")
	}

	if _, written := fake.Files[configDir+"/AGENTS.md"]; written {
		t.Fatal("OpenClaw writes its own AGENTS.md in its workspace; the module must not")
	}

	if !strings.Contains(string(fake.Files[configPath]), `"mode":"local"`) || fake.Owners[configPath] != "dev:dev" {
		t.Fatalf("an unconfigured gateway refuses to start: the seed must be there, dev's: %q %q", fake.Files[configPath], fake.Owners[configPath])
	}

	for _, line := range ctx.Output() {
		if strings.Contains(line, openaiKey) || strings.Contains(line, anthropicKey) {
			t.Fatalf("a key leaked into the journal: %s", line)
		}
	}

	status, err := (Module{}).Status(newContext(t, fake, modtest.Values{"always_on": true}))
	if err != nil {
		t.Fatal(err)
	}

	if !status.Installed || !status.Configured || status.Unit != Unit || status.Port != Port {
		t.Fatalf("status = %+v", status)
	}
}

func TestAConfigTheClientHoldsIsNeverTouched(t *testing.T) {
	fake := machine()
	fake.Files[configPath] = []byte(`{"gateway":{"mode":"local"},"channels":{"telegram":{"botToken":"x"}}}`)

	run(t, fake, modtest.Values{"always_on": true})

	if !strings.Contains(string(fake.Files[configPath]), "telegram") {
		t.Fatal("the client's configuration must stay as it is")
	}
}

func TestWithoutAlwaysOnTheGatewayIsACommand(t *testing.T) {
	fake := machine()

	run(t, fake, modtest.Values{"always_on": false})

	if _, written := fake.Files[unitPath]; written || fake.Units[Unit] == modtest.UnitActive {
		t.Fatal("no unit without always on")
	}
}

// The gateway reads the providers at start: a key rotated on disk is only in force once it has restarted.
func TestARotatedProviderKeyRestartsTheGateway(t *testing.T) {
	fake := machine()
	run(t, fake, modtest.Values{"always_on": true})
	fake.Restarts = map[string]int{}

	ctx := modtest.NewContext(t, fake, modtest.Options{
		Manifest: manifest(),
		Values:   modtest.Values{"always_on": true},
		Secrets:  modtest.Secrets{"providers.0": "openai:sk-rotated", "providers.1": "anthropic:" + anthropicKey},
	})
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	if fake.Restarts[Unit] != 1 || !strings.Contains(string(fake.Files[envPath]), "sk-rotated") {
		t.Fatalf("the gateway must restart on the new key: restarts=%d\n%s", fake.Restarts[Unit], fake.Files[envPath])
	}
}

func TestReplayMutatesNothing(t *testing.T) {
	fake := machine()
	run(t, fake, modtest.Values{"always_on": true})

	fake.Mutations = nil
	ctx := run(t, fake, modtest.Values{"always_on": true})

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine:\n  %s", strings.Join(fake.Mutations, "\n  "))
	}

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}
}

func TestANodeOpenClawRefusesFailsBeforeMiseSpendsAMinute(t *testing.T) {
	for version, accepted := range map[string]bool{"22.11.0": false, "24.15.9": false, "24.16.0": true, "25.0.0": false, "26.1.0": true, "27.0.0": true, "": false} {
		if got := nodeSupported(version); got != accepted {
			t.Errorf("node %q: supported = %v, want %v", version, got, accepted)
		}
	}

	fake := modtest.NewFakeSys()
	fake.Files[mise.Path] = []byte("mise")
	fake.Tools["node"] = "22.11.0"

	err := (Module{}).Install(newContext(t, fake, modtest.Values{}))
	if err == nil {
		t.Fatal("expected the install to fail")
	}

	step, ok := err.(*modules.StepError)
	if !ok || step.Step != "check-node" || !strings.Contains(err.Error(), "Node 24") {
		t.Fatalf("unexpected error: %#v", err)
	}

	if fake.Tools[tool] != "" {
		t.Fatal("nothing must be installed on a Node OpenClaw refuses")
	}
}

func TestUninstallKeepsTheWorkspaceAndForgetsTheKeys(t *testing.T) {
	fake := machine()
	run(t, fake, modtest.Values{"always_on": true})
	fake.Files[configDir+"/openclaw.json"] = []byte("{}")

	if err := (Module{}).Uninstall(newContext(t, fake, modtest.Values{})); err != nil {
		t.Fatal(err)
	}

	if fake.Tools[tool] != "" || fake.EnvValue("OPENCLAW_OPENAI_API_KEY") != "" || fake.Units[Unit] == modtest.UnitActive {
		t.Fatal("the CLI, the keys and the unit must go")
	}

	for _, gone := range []string{envPath, unitPath} {
		if _, kept := fake.Files[gone]; kept {
			t.Errorf("%s must go", gone)
		}
	}

	if _, kept := fake.Files[configDir+"/openclaw.json"]; !kept {
		t.Fatal("~/.openclaw is the client's")
	}
}

func TestFailedInstallCarriesItsReplayCommand(t *testing.T) {
	fake := machine()
	fake.FailProgram("mise", "mise: npm backend unavailable")

	err := (Module{}).Install(newContext(t, fake, modtest.Values{}))
	if err == nil {
		t.Fatal("expected the install to fail")
	}

	step, ok := err.(*modules.StepError)
	if !ok || step.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected error: %#v", err)
	}
}

var _ modules.Module = Module{}

// A provider taken out of the form leaves nothing behind: neither its key in /etc/pupitre/env and the credentials file, nor its name in the status.
func TestAWithdrawnProviderIsForgottenEverywhere(t *testing.T) {
	fake := machine()
	run(t, fake, modtest.Values{"always_on": false})

	ctx := modtest.NewContext(t, fake, modtest.Options{
		Manifest: manifest(),
		Values:   modtest.Values{"always_on": false},
		Secrets:  modtest.Secrets{"providers.0": "anthropic:" + anthropicKey},
	})
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	if fake.EnvValue(envPrefix+"OPENAI_API_KEY") != "" || strings.Contains(string(fake.Files[envPath]), openaiKey) {
		t.Fatalf("the openai key must be gone: env %s / %s", fake.Files["/etc/pupitre/env"], fake.Files[envPath])
	}

	if fake.EnvValue(envPrefix+"ANTHROPIC_API_KEY") != anthropicKey {
		t.Fatal("the provider kept must keep its key")
	}

	status, err := (Module{}).Status(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, named := status.Credentials[envPrefix+"OPENAI_API_KEY"]; named {
		t.Fatalf("the status still names the withdrawn provider: %v", status.Credentials)
	}
}
