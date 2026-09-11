//go:build staging

package staging

import (
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
)

var runtimeInstall = request{Cmd: "install", Params: map[string]any{
	"modules":       []string{"runtime.node", "runtime.java", "runtime.python", "runtime.go", "runtime.php", "runtime.ruby", "runtime.docker"},
	"secrets_stdin": false,
	"config": map[string]any{
		"core.system":    map[string]any{"timezone": "Europe/Paris", "git_name": "Pupitre Staging", "git_email": "staging@pupitre.studio"},
		"runtime.node":   map[string]any{"node_version": "22", "bun": true, "pnpm": true, "yarn": true},
		"runtime.java":   map[string]any{"java_version": "21"},
		"runtime.python": map[string]any{"python_version": "3.12"},
		"runtime.go":     map[string]any{"go_version": "1.25"},
		"runtime.php":    map[string]any{"php_version": "8.4", "composer": true},
		"runtime.ruby":   map[string]any{"ruby_version": "3.4", "bundler": true},
		"runtime.docker": map[string]any{"compose": true},
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

	if out := ssh(t, dev, "pnpm -v && yarn -v && python3 -V"); !strings.Contains(out, "Python 3.12") {
		t.Fatalf("pnpm, yarn and python must answer too:\n%s", out)
	}
}

// Go, PHP and Ruby come from the same mise as the others: what proves them is the same non-interactive shell.
func TestTheOtherRuntimesAnswerToo(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	out := ssh(t, dev, "go version && php -v && ruby -v && composer --version")
	for _, want := range []string{"go1.25", "PHP 8.4", "ruby 3.4", "Composer"} {
		if !strings.Contains(out, want) {
			t.Errorf("%q missing from a non-interactive shell:\n%s", want, out)
		}
	}

	if gopath := ssh(t, dev, "echo $GOPATH"); !strings.Contains(gopath, "/go") {
		t.Fatalf("GOPATH must reach a non-interactive shell: %q", gopath)
	}

	if limit := ssh(t, dev, "php -r 'echo ini_get(\"memory_limit\");'"); !strings.Contains(limit, "512M") {
		t.Fatalf("the php.ini written by the module must be read: %q", limit)
	}
}

// Docker without the group is Docker behind sudo, and the agents that run as dev never get there.
func TestDockerAnswersAsDevWithoutSudo(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	if out := ssh(t, dev, "docker version --format '{{.Server.Version}}' && docker compose version"); !strings.Contains(out, "Docker Compose") {
		t.Fatalf("docker must answer as dev, without sudo:\n%s", out)
	}

	if config := ssh(t, host, "sudo", "cat", "/etc/docker/daemon.json"); !strings.Contains(config, `"max-size": "10m"`) {
		t.Errorf("the log rotation written by the module must be there:\n%s", config)
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
