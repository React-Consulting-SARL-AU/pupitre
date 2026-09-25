package runtime_test

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/java"
	"pupitre.studio/agent/internal/modules/runtime/node"
	"pupitre.studio/agent/internal/modules/runtime/python"
	"pupitre.studio/agent/internal/modules/runtime/shell"
)

const systemBlock = "# >>> pupitre core.system >>>\nexport PROJECTS_DIR='/home/dev/projects'\n# <<< pupitre core.system <<<\n"

var runtimeModules = []struct {
	module modules.Module
	values modtest.Values
}{
	{node.Module{}, modtest.Values{"node_versions": []string{"22"}, "bun": true, "pnpm": true}},
	{java.Module{}, modtest.Values{"java_versions": []string{"21"}}},
	{python.Module{}, modtest.Values{"python_versions": []string{"3.12"}}},
}

func registry(t *testing.T) *modules.Registry {
	t.Helper()

	registry := modules.NewRegistry()
	registry.Register(modtest.Passing{ID: "core.system"})

	for _, runtime := range runtimeModules {
		registry.Register(runtime.module)
	}

	return registry
}

func TestTranscripts(t *testing.T) {
	modtest.RunTranscripts(t, "testdata/*.jsonl", modtest.TranscriptOptions{Registry: registry(t)})
}

func installAll(t *testing.T, fake *modtest.FakeSys) {
	t.Helper()

	for _, runtime := range runtimeModules {
		ctx := modtest.NewContext(t, fake, modtest.Options{Manifest: runtime.module.Manifest(), Values: runtime.values})

		if err := runtime.module.Install(ctx); err != nil {
			t.Fatal(err)
		}
		if err := runtime.module.Configure(ctx); err != nil {
			t.Fatal(err)
		}

		for _, event := range ctx.Events() {
			if event.Status == contract.StepFail {
				t.Fatalf("%s · %s failed", event.Module, event.Step)
			}
		}
	}
}

func TestEachRuntimeKeepsItsOwnBlock(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files["/home/dev/.zshrc"] = []byte(systemBlock)
	fake.Files["/proc/meminfo"] = []byte("MemTotal:       4015000 kB\n")

	installAll(t, fake)

	if string(fake.Files["/home/dev/.zshrc"]) != systemBlock {
		t.Fatalf("core.system's .zshrc block was touched: %q", fake.Files["/home/dev/.zshrc"])
	}

	env := string(fake.Files[shell.EnvPath])

	for _, id := range []string{"runtime.node", "runtime.java", "runtime.python"} {
		if strings.Count(env, "# >>> pupitre "+id+" >>>") != 1 || strings.Count(env, "# <<< pupitre "+id+" <<<") != 1 {
			t.Fatalf("%s must appear exactly once in .zshenv:\n%s", id, env)
		}
	}

	for _, want := range []string{"COREPACK_ENABLE_DOWNLOAD_PROMPT=0", "JAVA_HOME=", "UV_PYTHON_PREFERENCE=system"} {
		if !strings.Contains(env, want) {
			t.Errorf(".zshenv lacks %q:\n%s", want, env)
		}
	}

	t.Logf(".zshenv after the three runtimes:\n%s", env)
}

func TestReinstallingOneRuntimeLeavesTheOthersAlone(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files["/home/dev/.zshrc"] = []byte(systemBlock)
	fake.Files["/proc/meminfo"] = []byte("MemTotal:       4015000 kB\n")

	installAll(t, fake)

	before := string(fake.Files[shell.EnvPath])

	ctx := modtest.NewContext(t, fake, modtest.Options{Manifest: node.Module{}.Manifest(), Values: modtest.Values{"node_versions": []string{"24"}, "bun": false, "pnpm": false}})
	if err := (node.Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := (node.Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	after := string(fake.Files[shell.EnvPath])
	if after == before {
		t.Fatal("the node block must follow the new values")
	}

	if strings.Contains(after, ".bun/bin") {
		t.Errorf("the node block kept the bun path:\n%s", after)
	}

	for _, kept := range []string{"JAVA_HOME=", "UV_PYTHON_PREFERENCE=system"} {
		if !strings.Contains(after, kept) {
			t.Errorf(".zshenv lost %q:\n%s", kept, after)
		}
	}

	if fake.Tools["java"] != "temurin-21" || fake.Tools["python"] != "3.12" || fake.Tools["node"] != "24" {
		t.Fatalf("tools = %v", fake.Tools)
	}
}
