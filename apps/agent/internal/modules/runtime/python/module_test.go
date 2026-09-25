package python

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/modules/runtime/shell"
)

var values = modtest.Values{"python_versions": []string{"3.12"}}

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

func TestInstallUvThenPython(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake)

	run(t, ctx)

	commands := strings.Join(fake.Commands(), "\n")

	for _, want := range []string{
		"(dev) mise use -g -y uv@latest",
		"(dev) mise use -g -y python@3.12",
	} {
		if !strings.Contains(commands, want) {
			t.Errorf("command %q not run:\n%s", want, commands)
		}
	}

	env := string(fake.Files[shell.EnvPath])

	for _, want := range []string{
		"# >>> pupitre runtime.python >>>",
		`export PATH="$HOME/.local/share/mise/shims:$PATH"`,
		"export UV_PYTHON_PREFERENCE=system",
		"# <<< pupitre runtime.python <<<",
	} {
		if !strings.Contains(env, want) {
			t.Errorf(".zshenv lacks %q:\n%s", want, env)
		}
	}

	status, err := (Module{}).Status(ctx)
	if err != nil || !status.Installed || !status.Configured || status.State != contract.ServiceRunning {
		t.Fatalf("status = %+v, %v", status, err)
	}

	if status.Version != "python 3.12 · uv latest" {
		t.Fatalf("status must report what mise carries, got %q", status.Version)
	}

	if err := contract.ValidateValue("ServiceStatusResult", status.Service(manifest())); err != nil {
		t.Fatal(err)
	}
}

func TestReplayOnAnInstalledMachineChangesNothing(t *testing.T) {
	fake := modtest.NewFakeSys()
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

func TestAnotherPythonMajorIsInstalledAlongside(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[mise.Path] = []byte("mise\n")
	fake.Tools["python"] = "3.11.9"
	fake.Tools["uv"] = "0.5.11"

	ctx := newContext(t, fake)
	run(t, ctx)

	steps := statuses(ctx)
	if steps["install-uv"] != contract.StepSkip || steps["install-python-3.12"] != contract.StepOK || steps["prune-python"] != contract.StepOK {
		t.Fatalf("steps = %v", steps)
	}

	if fake.Tools["python"] != "3.12" || strings.Join(fake.Versions["python"], ",") != "3.12" {
		t.Fatalf("a major nobody asked for goes: tools = %v, versions = %v", fake.Tools, fake.Versions)
	}
}

func TestFailedInstallReportsReplay(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailProgram("curl", "curl: (7) Failed to connect to mise.jdx.dev port 443")
	ctx := newContext(t, fake)

	err := (Module{}).Install(ctx)
	if err == nil || !strings.Contains(err.Error(), "runtime.python · install-mise") {
		t.Fatalf("unexpected error: %v", err)
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only=runtime.python" {
		t.Fatalf("unexpected event: %+v", last)
	}
}

func TestUninstallLeavesMiseAndTheOtherBlocks(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake))
	fake.Files[shell.EnvPath] = append([]byte("# >>> pupitre runtime.node >>>\nexport COREPACK_ENABLE_DOWNLOAD_PROMPT=0\n# <<< pupitre runtime.node <<<\n"), fake.Files[shell.EnvPath]...)
	fake.Tools["node"] = "22"

	ctx := newContext(t, fake)
	if err := (Module{}).Uninstall(ctx); err != nil {
		t.Fatal(err)
	}

	for _, tool := range []string{"python", "uv"} {
		if _, present := fake.Tools[tool]; present || len(fake.Versions[tool]) != 0 {
			t.Errorf("%s still installed", tool)
		}
	}

	if fake.Tools["node"] != "22" || !mise.Present(ctx) {
		t.Error("uninstall must keep mise and the other runtimes")
	}

	env := string(fake.Files[shell.EnvPath])
	if strings.Contains(env, "runtime.python") || !strings.Contains(env, "runtime.node") {
		t.Errorf(".zshenv = %q", env)
	}
}

var _ modules.Module = Module{}
