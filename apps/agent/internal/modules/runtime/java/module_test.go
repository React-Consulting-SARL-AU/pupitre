package java

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/modules/runtime/shell"
)

var values = modtest.Values{"java_version": "21"}

func machine(totalKB string) *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Files[meminfoPath] = []byte("MemTotal:       " + totalKB + " kB\nMemFree:          200000 kB\n")

	return fake
}

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
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

func TestInstallTemurinAndSizeTheDaemon(t *testing.T) {
	fake := machine("4015000")
	ctx := newContext(t, fake)

	run(t, ctx)

	commands := strings.Join(fake.Commands(), "\n")
	for _, want := range []string{
		"(dev) mise use -g -y java@temurin-21",
		"(dev) mise where java",
	} {
		if !strings.Contains(commands, want) {
			t.Errorf("command %q not run:\n%s", want, commands)
		}
	}

	env := string(fake.Files[shell.EnvPath])
	for _, want := range []string{
		"# >>> pupitre runtime.java >>>",
		`export PATH="$HOME/.local/share/mise/shims:$PATH"`,
		`export JAVA_HOME="/home/dev/.local/share/mise/installs/java/temurin-21"`,
	} {
		if !strings.Contains(env, want) {
			t.Errorf(".zshenv lacks %q:\n%s", want, env)
		}
	}

	gradle := string(fake.Files[gradlePath])
	for _, want := range []string{
		"# >>> pupitre runtime.java >>>",
		"org.gradle.daemon=true",
		"org.gradle.parallel=true",
		"org.gradle.caching=true",
		"org.gradle.jvmargs=-Xmx1960m -XX:MaxMetaspaceSize=512m",
	} {
		if !strings.Contains(gradle, want) {
			t.Errorf("gradle.properties lacks %q:\n%s", want, gradle)
		}
	}

	if fake.Owners[gradlePath] != "dev:dev" || fake.Owners[gradleDir] != "dev:dev" {
		t.Errorf("owners = %v", fake.Owners)
	}

	status, err := (Module{}).Status(ctx)
	if err != nil || !status.Installed || !status.Configured || status.Version != "java temurin-21" {
		t.Fatalf("status = %+v, %v", status, err)
	}

	if err := contract.ValidateValue("ServiceStatusResult", status.Service(manifest())); err != nil {
		t.Fatal(err)
	}
}

func TestReplayOnAnInstalledMachineChangesNothing(t *testing.T) {
	fake := machine("4015000")
	run(t, newContext(t, fake))

	mutations := len(fake.Mutations)
	ctx := newContext(t, fake)
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

func TestHeapFollowsTheMachine(t *testing.T) {
	for _, sizing := range []struct {
		totalKB string
		heap    int
	}{
		{"1015000", minHeapMB},
		{"4015000", 1960},
		{"16318000", maxHeapMB},
	} {
		fake := machine(sizing.totalKB)
		ctx := newContext(t, fake)

		if got := heapMB(ctx); got != sizing.heap {
			t.Errorf("%s kB → %d MB, want %d", sizing.totalKB, got, sizing.heap)
		}
	}
}

func TestMissingJavaHomeWarnsWithoutFailing(t *testing.T) {
	fake := machine("4015000")
	fake.Files[mise.Path] = []byte("mise\n")
	fake.Tools["java"] = "temurin-21"
	fake.FailProgram("mise", "mise: command not found")

	ctx := newContext(t, fake)
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	if strings.Contains(string(fake.Files[shell.EnvPath]), "JAVA_HOME") {
		t.Error("no JAVA_HOME may be written when mise cannot resolve it")
	}

	if output := strings.Join(ctx.Output(), "\n"); !strings.Contains(output, "! JAVA_HOME introuvable") {
		t.Fatalf("no warning in output:\n%s", output)
	}
}

func TestFailedInstallReportsReplay(t *testing.T) {
	fake := machine("4015000")
	fake.FailProgram("curl", "curl: (7) Failed to connect to mise.jdx.dev port 443")
	ctx := newContext(t, fake)

	err := (Module{}).Install(ctx)
	if err == nil || !strings.Contains(err.Error(), "runtime.java · install-mise") {
		t.Fatalf("unexpected error: %v", err)
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only=runtime.java" {
		t.Fatalf("unexpected event: %+v", last)
	}
}

func TestUninstallKeepsTheClientGradleSettings(t *testing.T) {
	fake := machine("4015000")
	run(t, newContext(t, fake))
	fake.Files[gradlePath] = append([]byte("org.gradle.console=rich\n"), fake.Files[gradlePath]...)

	ctx := newContext(t, fake)
	if err := (Module{}).Uninstall(ctx); err != nil {
		t.Fatal(err)
	}

	gradle := string(fake.Files[gradlePath])
	if strings.Contains(gradle, "jvmargs") || !strings.Contains(gradle, "org.gradle.console=rich") {
		t.Fatalf("gradle.properties = %q", gradle)
	}

	if _, present := fake.Tools["java"]; present {
		t.Error("java still installed")
	}

	if !mise.Present(ctx) {
		t.Error("mise must stay for the other runtimes")
	}
}

var _ modules.Module = Module{}
