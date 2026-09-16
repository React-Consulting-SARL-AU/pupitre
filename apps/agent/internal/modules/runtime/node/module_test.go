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

var everything = modtest.Values{"node_versions": []string{"22", "24"}, "bun": true, "pnpm": true, "yarn": true}

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
		"curl -fsSL --proto =https --tlsv1.2 https://mise.jdx.dev/VERSION",
		"curl -fsSL --proto =https --tlsv1.2 https://github.com/jdx/mise/releases/download/v" + modtest.MiseVersion + "/SHASUMS256.txt",
		"curl -fsSL --proto =https --tlsv1.2 -o /var/lib/pupitre/downloads/mise https://github.com/jdx/mise/releases/download/v" + modtest.MiseVersion + "/mise-v" + modtest.MiseVersion + "-linux-",
		"sha256sum /var/lib/pupitre/downloads/mise",
		"(dev) mise install -y node@24",
		"(dev) mise install -y node@22",
		"(dev) mise use -g -y node@24",
		"(dev) mise use -g -y bun@latest",
		"(dev) mise use -g -y npm:pnpm@latest",
		"(dev) mise use -g -y npm:yarn@latest",
		"(dev) corepack enable pnpm yarn",
	} {
		if !strings.Contains(commands, want) {
			t.Errorf("command %q not run:\n%s", want, commands)
		}
	}

	if fake.Tools["node"] != "24" || strings.Join(fake.Versions["node"], ",") != "24,22" || fake.Tools["bun"] != "latest" || fake.Tools["npm:pnpm"] != "latest" || fake.Tools["npm:yarn"] != "latest" {
		t.Fatalf("tools = %v, versions = %v", fake.Tools, fake.Versions)
	}

	if fake.Owners[shell.EnvPath] != "dev:dev" || fake.Owners[mise.Path] != "dev:dev" || fake.Modes[mise.Path] != 0o755 {
		t.Errorf("owners = %v, mise mode = %o", fake.Owners, fake.Modes[mise.Path])
	}

	if _, staged := fake.Files["/var/lib/pupitre/downloads/mise"]; staged || strings.Contains(commands, "(dev) curl") {
		t.Fatal("mise is fetched by root into its staging folder and removed once installed; nothing is downloaded as dev")
	}

	env := string(fake.Files[shell.EnvPath])
	for _, want := range []string{
		"# >>> pupitre runtime.node >>>",
		`export PATH="$HOME/.local/bin:$PATH"`,
		`export PATH="$HOME/.local/share/mise/shims:$PATH"`,
		`export PATH="$HOME/.bun/bin:$PATH"`,
		"export COREPACK_ENABLE_DOWNLOAD_PROMPT=0",
		"export MISE_NPM_PACKAGE_MANAGER=npm",
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

	if status.Version != "node 22 · 24 · bun latest · pnpm latest · yarn latest" || strings.Join(status.Versions, ",") != "24,22" {
		t.Fatalf("status must report what mise carries, got %q and %v", status.Version, status.Versions)
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

func TestTheOptionalManagersDisabledInstallNothing(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, modtest.Values{"node_versions": []string{"22"}, "bun": false, "pnpm": false, "yarn": false})

	run(t, ctx)

	for _, spec := range []string{"bun", "npm:pnpm", "npm:yarn"} {
		if _, present := fake.Tools[spec]; present {
			t.Errorf("%s must not be installed when its field is false", spec)
		}
	}

	commands := strings.Join(fake.Commands(), "\n")
	for _, forbidden := range []string{"bun@", "pnpm@", "yarn@", "corepack"} {
		if strings.Contains(commands, forbidden) {
			t.Errorf("command mentioning %q was run:\n%s", forbidden, commands)
		}
	}

	steps := statuses(ctx)
	for _, step := range []string{"install-bun", "install-pnpm", "install-yarn", "enable-corepack"} {
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

// Yarn is off by default: whoever turns it on gets corepack enabled for it and for nothing they left off.
func TestYarnAloneEnablesCorepackForYarnAlone(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, modtest.Values{"node_versions": []string{"22"}, "bun": false, "pnpm": false, "yarn": true})

	run(t, ctx)

	if fake.Tools["npm:yarn"] != "latest" {
		t.Fatalf("tools = %v", fake.Tools)
	}

	commands := strings.Join(fake.Commands(), "\n")
	if !strings.Contains(commands, "(dev) corepack enable yarn") || strings.Contains(commands, "corepack enable pnpm") {
		t.Fatalf("corepack must be enabled for yarn alone:\n%s", commands)
	}

	if defaulted := manifest().Fields[3]; defaulted.Key != "yarn" || defaulted.Default != false {
		t.Fatalf("yarn must be offered off by default, got %+v", defaulted)
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
	if err == nil || !strings.Contains(err.Error(), "install-node-24") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestUpgradeFollowsWhatMiseReports(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, everything))
	fake.Upgrades["mise:node@22"] = "22.14.0"
	fake.Upgrades["mise:bun"] = "1.3.0"

	ctx := newContext(t, fake, everything)
	if err := (Module{}).Upgrade(ctx); err != nil {
		t.Fatal(err)
	}

	steps := statuses(ctx)
	if steps["upgrade-node"] != contract.StepOK || steps["upgrade-managers"] != contract.StepOK {
		t.Fatalf("steps = %v", steps)
	}

	if strings.Join(fake.Versions["node"], ",") != "24,22.14.0" || fake.Tools["bun"] != "1.3.0" {
		t.Fatalf("tools = %v, versions = %v", fake.Tools, fake.Versions)
	}

	ctx = newContext(t, fake, everything)
	if err := (Module{}).Upgrade(ctx); err != nil {
		t.Fatal(err)
	}

	if steps := statuses(ctx); steps["upgrade-node"] != contract.StepSkip || steps["upgrade-managers"] != contract.StepSkip {
		t.Fatalf("a second upgrade with nothing new must skip: %v", steps)
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

	for _, manager := range managers {
		if _, present := fake.Tools[manager.spec]; present {
			t.Errorf("%s still installed", manager.spec)
		}
	}

	if _, present := fake.Tools["node"]; present || len(fake.Versions["node"]) != 0 {
		t.Errorf("node still installed: %v %v", fake.Tools, fake.Versions)
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

// mise runs as dev and writes under ~/.local: nothing the module creates there may belong to root.
func TestInstallLeavesNoRootFolderInHome(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Users[shell.User] = shell.Home
	fake.Dirs[shell.Home] = true
	fake.Owners[shell.Home] = "dev:dev"
	ctx := newContext(t, fake, everything)

	run(t, ctx)

	for _, dir := range []string{shell.Home + "/.local", mise.BinDir, shell.Home + "/.local/share", mise.DataDir} {
		if !fake.Dirs[dir] || fake.Owners[dir] != "dev:dev" {
			t.Errorf("%s: exists %v, owner %q", dir, fake.Dirs[dir], fake.Owners[dir])
		}
	}
}
