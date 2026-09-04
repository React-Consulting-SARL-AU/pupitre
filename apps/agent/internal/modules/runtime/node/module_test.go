package node

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/modules/runtime/shell"
)

var everything = modtest.Values{"node_version": "22", "bun": true, "pnpm": true}

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

func TestInstallOnAMachineWithoutMise(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, everything)

	run(t, ctx)

	commands := strings.Join(fake.Commands(), "\n")
	for _, want := range []string{
		"(dev) curl -fsSL --proto =https --tlsv1.2 -o /home/dev/.local/bin/mise https://mise.jdx.dev/mise-latest-linux-",
		"(dev) chmod 0755 /home/dev/.local/bin/mise",
		"(dev) mise use -g -y node@22",
		"(dev) mise use -g -y bun@latest",
		"(dev) mise use -g -y pnpm@latest",
		"(dev) corepack enable pnpm",
	} {
		if !strings.Contains(commands, want) {
			t.Errorf("command %q not run:\n%s", want, commands)
		}
	}

	if fake.Tools["node"] != "22" || fake.Tools["bun"] != "latest" || fake.Tools["pnpm"] != "latest" {
		t.Fatalf("tools = %v", fake.Tools)
	}

	if fake.Owners[shell.EnvPath] != "dev:dev" || fake.Owners[mise.Path] != "dev:dev" {
		t.Errorf("owners = %v", fake.Owners)
	}

	env := string(fake.Files[shell.EnvPath])
	for _, want := range []string{
		"# >>> pupitre runtime.node >>>",
		`export PATH="$HOME/.local/bin:$PATH"`,
		`export PATH="$HOME/.local/share/mise/shims:$PATH"`,
		`export PATH="$HOME/.bun/bin:$PATH"`,
		"export COREPACK_ENABLE_DOWNLOAD_PROMPT=0",
		"# <<< pupitre runtime.node <<<",
	} {
		if !strings.Contains(env, want) {
			t.Errorf(".zshenv lacks %q:\n%s", want, env)
		}
	}

	for step, status := range statuses(ctx) {
		if status == contract.StepFail {
			t.Errorf("step %s failed", step)
		}
	}

	status, err := (Module{}).Status(ctx)
	if err != nil || !status.Installed || !status.Configured || status.State != contract.ServiceRunning {
		t.Fatalf("status = %+v, %v", status, err)
	}

	if status.Version != "node 22 · bun latest · pnpm latest" {
		t.Fatalf("status must report what mise carries, got %q", status.Version)
	}

	if err := contract.ValidateValue("ServiceStatusResult", status.Service(manifest())); err != nil {
		t.Fatal(err)
	}
}

func TestReplayOnAnInstalledMachineChangesNothing(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, everything))

	mutations, calls := len(fake.Mutations), len(fake.Calls)
	ctx := newContext(t, fake, everything)
	run(t, ctx)

	for step, status := range statuses(ctx) {
		if status != contract.StepSkip {
			t.Errorf("replay: %s = %s, want skip", step, status)
		}
	}

	if len(fake.Mutations) != mutations {
		t.Fatalf("replay wrote to the machine: %v", fake.Mutations[mutations:])
	}

	t.Logf("first run: %d calls, %d mutations; replay: %d calls, 0 mutations", calls, mutations, len(fake.Calls)-calls)
}

func TestBunAndPnpmDisabledInstallNothing(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, modtest.Values{"node_version": "22", "bun": false, "pnpm": false})

	run(t, ctx)

	if _, present := fake.Tools["bun"]; present {
		t.Error("bun must not be installed when the field is false")
	}
	if _, present := fake.Tools["pnpm"]; present {
		t.Error("pnpm must not be installed when the field is false")
	}

	commands := strings.Join(fake.Commands(), "\n")
	for _, forbidden := range []string{"bun@", "pnpm@", "corepack"} {
		if strings.Contains(commands, forbidden) {
			t.Errorf("command mentioning %q was run:\n%s", forbidden, commands)
		}
	}

	steps := statuses(ctx)
	for _, step := range []string{"install-bun", "install-pnpm", "enable-corepack"} {
		if steps[step] != contract.StepSkip {
			t.Errorf("%s = %s, want skip", step, steps[step])
		}
	}

	env := string(fake.Files[shell.EnvPath])
	if strings.Contains(env, ".bun/bin") {
		t.Errorf(".zshenv must not carry the bun path when bun is off:\n%s", env)
	}
	if !strings.Contains(env, "mise/shims") || !strings.Contains(env, "COREPACK_ENABLE_DOWNLOAD_PROMPT") {
		t.Errorf(".zshenv block is incoherent:\n%s", env)
	}
}

func TestFailedDownloadReportsReplay(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailProgram("curl", "curl: (7) Failed to connect to mise.jdx.dev port 443")
	ctx := newContext(t, fake, everything)

	err := (Module{}).Install(ctx)
	if err == nil || !strings.Contains(err.Error(), "runtime.node · install-mise") {
		t.Fatalf("unexpected error: %v", err)
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only=runtime.node" {
		t.Fatalf("unexpected event: %+v", last)
	}
}

func TestSilentMiseFailsTheStep(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[mise.Path] = []byte("mise\n")
	fake.FailProgram("mise", "")
	ctx := newContext(t, fake, everything)

	err := (Module{}).Install(ctx)
	if err == nil || !strings.Contains(err.Error(), "install-node") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestUpgradeFollowsWhatMiseReports(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, everything))
	fake.Upgrades["mise:node"] = "22.14.0"

	ctx := newContext(t, fake, everything)
	if err := (Module{}).Upgrade(ctx); err != nil {
		t.Fatal(err)
	}

	if statuses(ctx)["upgrade-runtimes"] != contract.StepOK || fake.Tools["node"] != "22.14.0" {
		t.Fatalf("upgrade = %s, tools = %v", statuses(ctx)["upgrade-runtimes"], fake.Tools)
	}

	ctx = newContext(t, fake, everything)
	if err := (Module{}).Upgrade(ctx); err != nil {
		t.Fatal(err)
	}

	if statuses(ctx)["upgrade-runtimes"] != contract.StepSkip {
		t.Fatal("a second upgrade with nothing new must skip")
	}
}

func TestUninstallLeavesMiseAndTheOtherBlocks(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, everything))
	fake.Files[shell.EnvPath] = append([]byte("# >>> pupitre runtime.java >>>\nexport JAVA_HOME=\"/opt/java\"\n# <<< pupitre runtime.java <<<\n"), fake.Files[shell.EnvPath]...)
	fake.Tools["java"] = "temurin-21"

	ctx := newContext(t, fake, everything)
	if err := (Module{}).Uninstall(ctx); err != nil {
		t.Fatal(err)
	}

	for _, tool := range tools {
		if _, present := fake.Tools[tool]; present {
			t.Errorf("%s still installed", tool)
		}
	}

	if fake.Tools["java"] != "temurin-21" || !mise.Present(ctx) {
		t.Error("uninstall must keep mise and the other runtimes")
	}

	env := string(fake.Files[shell.EnvPath])
	if strings.Contains(env, "runtime.node") || !strings.Contains(env, "runtime.java") {
		t.Errorf(".zshenv = %q", env)
	}
}

var _ modules.Module = Module{}
