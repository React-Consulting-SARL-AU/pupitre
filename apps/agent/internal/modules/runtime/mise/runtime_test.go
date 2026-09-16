package mise

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
)

var sample = Runtime{Tool: "node", Options: []string{"24", "22", "20"}, Default: "24"}

func manifestOf(runtime Runtime) contract.Manifest {
	return contract.Manifest{
		ID:       "runtime." + runtime.Tool,
		Category: "runtime",
		Name:     runtime.Tool,
		Summary:  "test",
		Arch:     []string{"amd64", "arm64"},
		Fields:   []contract.Field{runtime.Field("Versions", "help")},
		Since:    "0.1.0",
	}
}

func newContext(t *testing.T, fake *modtest.FakeSys, runtime Runtime, versions ...string) *modules.Context {
	t.Helper()

	values := modtest.Values{}
	if versions != nil {
		values[runtime.Key()] = versions
	}

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifestOf(runtime), Values: values})
}

func statuses(ctx *modules.Context) map[string]contract.StepStatus {
	result := map[string]contract.StepStatus{}
	for _, event := range ctx.Events() {
		result[event.Step] = event.Status
	}

	return result
}

func TestTheFieldIsAVersionsFieldTheContractAccepts(t *testing.T) {
	if err := contract.ValidateValue("Manifest", manifestOf(sample)); err != nil {
		t.Fatal(err)
	}

	field := sample.Field("Node", "help")
	if field.Key != "node_versions" || field.Kind != contract.FieldVersions {
		t.Fatalf("field = %+v", field)
	}
}

func TestWantedRunsNewestFirstWhateverTheOrderSent(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, sample, "20", "24", "24", "18")

	if got := sample.Wanted(ctx); strings.Join(got, ",") != "24,20" {
		t.Fatalf("wanted = %v", got)
	}

	if got := sample.Wanted(newContext(t, fake, sample)); strings.Join(got, ",") != "24" {
		t.Fatalf("nothing sent must read as the manifest's default, got %v", got)
	}
}

func TestInstallPutsEveryMajorAndMakesTheNewestTheDefault(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[Path] = []byte("mise\n")
	ctx := newContext(t, fake, sample, "22", "24")

	added, err := sample.Install(ctx)
	if err != nil {
		t.Fatal(err)
	}

	if strings.Join(added, ",") != "24,22" {
		t.Fatalf("added = %v", added)
	}

	commands := strings.Join(fake.Commands(), "\n")
	for _, want := range []string{"(dev) mise install -y node@24", "(dev) mise install -y node@22", "(dev) mise use -g -y node@24"} {
		if !strings.Contains(commands, want) {
			t.Errorf("command %q not run:\n%s", want, commands)
		}
	}

	if fake.Tools["node"] != "24" || strings.Join(fake.Versions["node"], ",") != "24,22" {
		t.Fatalf("tools = %v, versions = %v", fake.Tools, fake.Versions)
	}

	steps := statuses(ctx)
	for step, want := range map[string]contract.StepStatus{"install-node-24": contract.StepOK, "install-node-22": contract.StepOK, "use-node": contract.StepOK, "prune-node": contract.StepSkip} {
		if steps[step] != want {
			t.Errorf("%s = %s, want %s", step, steps[step], want)
		}
	}

	if got := sample.Held(ctx); strings.Join(got, ",") != "24,22" {
		t.Fatalf("held = %v", got)
	}

	if got := sample.Describe(ctx); got != "node 22 · 24" {
		t.Fatalf("describe = %q", got)
	}
}

func TestReplayChangesNothing(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[Path] = []byte("mise\n")
	if _, err := sample.Install(newContext(t, fake, sample, "22", "24")); err != nil {
		t.Fatal(err)
	}

	mutations := len(fake.Mutations)
	ctx := newContext(t, fake, sample, "22", "24")

	added, err := sample.Install(ctx)
	if err != nil {
		t.Fatal(err)
	}

	if len(added) != 0 || len(fake.Mutations) != mutations {
		t.Fatalf("replay added %v and wrote %v", added, fake.Mutations[mutations:])
	}

	for step, status := range statuses(ctx) {
		if status != contract.StepSkip {
			t.Errorf("replay: %s = %s, want skip", step, status)
		}
	}
}

// A major no longer asked for goes; the default follows the newest of what stays.
func TestAMajorUncheckedIsRemovedAndTheDefaultMoves(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[Path] = []byte("mise\n")
	if _, err := sample.Install(newContext(t, fake, sample, "24", "22")); err != nil {
		t.Fatal(err)
	}

	ctx := newContext(t, fake, sample, "22")
	if _, err := sample.Install(ctx); err != nil {
		t.Fatal(err)
	}

	commands := strings.Join(fake.Commands(), "\n")
	if !strings.Contains(commands, "(dev) mise uninstall node@24") || !strings.Contains(commands, "(dev) mise use -g -y node@22") {
		t.Fatalf("commands:\n%s", commands)
	}

	if fake.Tools["node"] != "22" || strings.Join(fake.Versions["node"], ",") != "22" {
		t.Fatalf("tools = %v, versions = %v", fake.Tools, fake.Versions)
	}

	steps := statuses(ctx)
	if steps["prune-node"] != contract.StepOK || steps["use-node"] != contract.StepOK || steps["install-node-22"] != contract.StepSkip {
		t.Fatalf("steps = %v", steps)
	}
}

func TestSilentMiseFailsTheInstallStep(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[Path] = []byte("mise\n")
	fake.FailProgram("mise", "")
	ctx := newContext(t, fake, sample, "24")

	_, err := sample.Install(ctx)
	if err == nil || !strings.Contains(err.Error(), "install-node-24") {
		t.Fatalf("unexpected error: %v", err)
	}
}

// An upgrade takes each major to its latest patch and drops the patch it replaces; nothing new reads as skipped.
func TestUpgradeFollowsEachMajor(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[Path] = []byte("mise\n")
	if _, err := sample.Install(newContext(t, fake, sample, "24", "22")); err != nil {
		t.Fatal(err)
	}
	fake.Upgrades["mise:node@22"] = "22.14.0"

	ctx := newContext(t, fake, sample, "24", "22")
	if err := sample.Upgrade(ctx); err != nil {
		t.Fatal(err)
	}

	if statuses(ctx)["upgrade-node"] != contract.StepOK {
		t.Fatalf("upgrade = %s", statuses(ctx)["upgrade-node"])
	}

	if got := strings.Join(fake.Versions["node"], ","); got != "24,22.14.0" {
		t.Fatalf("versions = %v", got)
	}

	ctx = newContext(t, fake, sample, "24", "22")
	if err := sample.Upgrade(ctx); err != nil {
		t.Fatal(err)
	}

	if statuses(ctx)["upgrade-node"] != contract.StepSkip {
		t.Fatal("a second upgrade with nothing new must skip")
	}
}

func TestUninstallDropsEveryVersionAndKeepsMise(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[Path] = []byte("mise\n")
	if _, err := sample.Install(newContext(t, fake, sample, "24", "22")); err != nil {
		t.Fatal(err)
	}
	fake.Tools["java"] = "temurin-21"

	ctx := newContext(t, fake, sample, "24", "22")
	if err := sample.Uninstall(ctx); err != nil {
		t.Fatal(err)
	}

	if _, present := fake.Tools["node"]; present || len(fake.Versions["node"]) != 0 || fake.Tools["java"] != "temurin-21" || !Present(ctx) {
		t.Fatalf("tools = %v, versions = %v", fake.Tools, fake.Versions)
	}

	ctx = newContext(t, fake, sample, "24", "22")
	if err := sample.Uninstall(ctx); err != nil || statuses(ctx)["remove-node"] != contract.StepSkip {
		t.Fatalf("a second uninstall must skip: %v, %v", err, statuses(ctx))
	}
}

// Java asks mise for temurin-21, and what mise lists is temurin-21.0.4+7: the major is read back through the distribution.
func TestADistributionPrefixIsCarriedAndReadBack(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[Path] = []byte("mise\n")
	fake.Upgrades["mise:java@temurin-21"] = "temurin-21.0.4+7.0.LTS"
	ctx := newContext(t, fake, Java, "21")

	if _, err := Java.Install(ctx); err != nil {
		t.Fatal(err)
	}

	if fake.Tools["java"] != "temurin-21" || strings.Join(fake.Versions["java"], ",") != "temurin-21.0.4+7.0.LTS" {
		t.Fatalf("tools = %v, versions = %v", fake.Tools, fake.Versions)
	}

	if got := Java.Held(ctx); strings.Join(got, ",") != "21" {
		t.Fatalf("held = %v", got)
	}

	if !strings.Contains(strings.Join(fake.Commands(), "\n"), "(dev) mise install -y java@temurin-21") {
		t.Fatal("the distribution must prefix what mise is asked for")
	}
}

// A CLI shimmed by mise runs under the default node: the newest of the major mise use -g named, not the newest on the machine.
func TestDefaultFollowsTheGlobalRequest(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[Path] = []byte("mise\n")
	fake.Upgrades["mise:node@22"] = "22.19.0"
	fake.Upgrades["mise:node@24"] = "24.8.0"
	ctx := newContext(t, fake, sample, "24", "22")

	if _, err := sample.Install(ctx); err != nil {
		t.Fatal(err)
	}

	if got := Default(ctx, "node"); got != "24.8.0" {
		t.Fatalf("default = %q", got)
	}

	if _, err := sample.Install(newContext(t, fake, sample, "22")); err != nil {
		t.Fatal(err)
	}

	if got := Default(ctx, "node"); got != "22.19.0" {
		t.Fatalf("default after the move = %q", got)
	}

	if got := Default(ctx, "deno"); got != "" {
		t.Fatalf("a tool mise does not hold has no default, got %q", got)
	}
}

func TestEveryRuntimeIsNamedOnceAndFoundByTool(t *testing.T) {
	seen := map[string]bool{}
	for _, runtime := range Runtimes() {
		if seen[runtime.Tool] {
			t.Errorf("%s listed twice", runtime.Tool)
		}
		seen[runtime.Tool] = true

		found, ok := RuntimeOf(runtime.Tool)
		if !ok || found.Tool != runtime.Tool {
			t.Errorf("%s not found by tool", runtime.Tool)
		}

		if !contains(runtime.Options, runtime.Default) {
			t.Errorf("%s: default %s is not an option", runtime.Tool, runtime.Default)
		}
	}

	if _, ok := RuntimeOf("deno"); ok {
		t.Error("deno is not a runtime")
	}
}

func contains(items []string, item string) bool {
	for _, held := range items {
		if held == item {
			return true
		}
	}

	return false
}
