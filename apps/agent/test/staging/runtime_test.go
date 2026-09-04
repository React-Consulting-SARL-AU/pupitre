//go:build staging

package staging

import (
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
)

var runtimeInstall = request{Cmd: "install", Params: map[string]any{
	"modules":       []string{"runtime.node", "runtime.java", "runtime.python"},
	"secrets_stdin": false,
	"config": map[string]any{
		"core.system":    map[string]any{"timezone": "Europe/Paris", "git_name": "Pupitre Staging", "git_email": "staging@pupitre.studio"},
		"runtime.node":   map[string]any{"node_version": "22", "bun": true, "pnpm": true},
		"runtime.java":   map[string]any{"java_version": "21"},
		"runtime.python": map[string]any{"python_version": "3.12"},
	},
}}

// `ssh dev@host '<cmd>'` runs a non-interactive zsh: it reads .zshenv and nothing else.
func TestRuntimesAnswerInANonInteractiveShell(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	first := agent(t, host, runtimeInstall)[0]
	result := decode[contract.InstallResult](t, first.Result)
	if len(result.Failed) != 0 {
		t.Fatalf("install failed: %v", result.Failed)
	}

	out := ssh(t, dev, "node -v && bun -v && java -version && uv --version")
	for _, want := range []string{"v22.", "openjdk version \"21", "uv "} {
		if !strings.Contains(out, want) {
			t.Errorf("the runtimes must answer over ssh, %q missing:\n%s", want, out)
		}
	}

	if versions := strings.Fields(strings.TrimSpace(out)); len(versions) < 4 {
		t.Fatalf("a runtime stayed silent:\n%s", out)
	}

	if out := ssh(t, dev, "pnpm -v && python3 -V"); !strings.Contains(out, "Python 3.12") {
		t.Fatalf("pnpm and python must answer too:\n%s", out)
	}
}

func TestJavaHomeAndGradleDaemonAreSized(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	if out := ssh(t, dev, "echo $JAVA_HOME"); !strings.Contains(out, "installs/java") {
		t.Fatalf("JAVA_HOME must reach a non-interactive shell: %q", out)
	}

	properties := ssh(t, dev, "cat", "/home/dev/.gradle/gradle.properties")
	for _, want := range []string{"# >>> pupitre runtime.java >>>", "org.gradle.daemon=true", "org.gradle.jvmargs=-Xmx"} {
		if !strings.Contains(properties, want) {
			t.Errorf("gradle.properties lacks %q:\n%s", want, properties)
		}
	}
}

func TestRuntimeBlocksStayApartAndReplayChangesNothing(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	env := ssh(t, dev, "cat", "/home/dev/.zshenv")
	for _, id := range []string{"runtime.node", "runtime.java", "runtime.python"} {
		if strings.Count(env, "# >>> pupitre "+id+" >>>") != 1 {
			t.Errorf("%s must own exactly one block in .zshenv:\n%s", id, env)
		}
	}

	if zshrc := ssh(t, dev, "cat", "/home/dev/.zshrc"); !strings.Contains(zshrc, "# >>> pupitre core.system >>>") {
		t.Fatalf("core.system's block must survive the runtimes:\n%s", zshrc)
	}

	var replay response
	elapsed := timed(t, "runtime install replay", func() { replay = agent(t, host, runtimeInstall)[0] })
	if changed := steps(replay, contract.StepOK); len(changed) != 0 || elapsed > 30*time.Second {
		t.Fatalf("replay must only skip in under 30 s: %v in %s", changed, elapsed)
	}
}
