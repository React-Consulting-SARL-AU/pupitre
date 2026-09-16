//go:build staging

package staging

import (
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/protocol"
)

var runtimeInstall = request{Cmd: "install", Params: map[string]any{
	"modules":       []string{"runtime.node", "runtime.java", "runtime.python", "runtime.go", "runtime.php", "runtime.ruby", "runtime.docker"},
	"secrets_stdin": false,
	"config": map[string]any{
		"core.system":    map[string]any{"timezone": "Europe/Paris", "git_name": "Pupitre Staging", "git_email": "staging@pupitre.studio"},
		"runtime.node":   map[string]any{"node_versions": []string{"22"}, "bun": true, "pnpm": true, "yarn": true},
		"runtime.java":   map[string]any{"java_versions": []string{"21"}},
		"runtime.python": map[string]any{"python_versions": []string{"3.12"}},
		"runtime.go":     map[string]any{"go_versions": []string{"1.25"}},
		"runtime.php":    map[string]any{"php_versions": []string{"8.4"}, "composer": true},
		"runtime.ruby":   map[string]any{"ruby_versions": []string{"3.4"}, "bundler": true},
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

func TestRustAnswersForDev(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	first := agent(t, host, request{Cmd: "install", Params: map[string]any{"modules": []string{"runtime.rust"}, "config": map[string]any{"runtime.rust": map[string]any{"rust_versions": []string{"1.98"}}}, "secrets_stdin": false}})[0]
	if result := decode[contract.InstallResult](t, first.Result); len(result.Failed) != 0 {
		t.Fatalf("install failed: %v", result.Failed)
	}

	for _, program := range []string{"cargo", "rustc"} {
		if out := ssh(t, dev, program, "--version"); !strings.Contains(out, "1.98") {
			t.Fatalf("%s must answer with the chosen version:\n%s", program, out)
		}
	}
}

// Two majors of Node side by side: the newest answers everywhere, and a project that pins the other gets it in its own folder alone — its mise.local.toml outside git's sight.
func TestARuntimeHoldsSeveralMajorsAndAProjectPinsOne(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)
	const project = "pinned"

	first := agent(t, host, request{Cmd: "install", Params: map[string]any{
		"modules":       []string{"runtime.node"},
		"secrets_stdin": false,
		"config":        map[string]any{"runtime.node": map[string]any{"node_versions": []string{"24", "22"}, "bun": false, "pnpm": false, "yarn": false}},
	}})[0]
	if result := decode[contract.InstallResult](t, first.Result); len(result.Failed) != 0 {
		t.Fatalf("install failed: %v", result.Failed)
	}

	if out := ssh(t, dev, "node -v"); !strings.Contains(out, "v24.") {
		t.Fatalf("the newest major is the default: %q", out)
	}

	status := decode[contract.ServiceStatus](t, agent(t, host, request{Cmd: "service.status", Params: map[string]any{"id": "runtime.node"}})[0].Result)
	if strings.Join(status.Versions, ",") != "24,22" {
		t.Fatalf("the service must list both majors, newest first: %v", status.Versions)
	}

	cleanup(t, host, project)
	ssh(t, host, "su", "-", "dev", "-c", "'mkdir -p /home/dev/projects/"+project+" && git -C /home/dev/projects/"+project+" init -q'")
	agent(t, host, request{Cmd: "project.add", Params: map[string]any{
		"name": project, "dir": project, "runtimes": map[string]any{"node": "22"},
		"processes": []map[string]any{{"id": "web", "pkgmgr": "none", "host": "127.0.0.1", "port": 5501, "routes": []map[string]any{}, "cmd": "sleep 3600"}},
	}})

	if out := ssh(t, dev, "cd /home/dev/projects/"+project+" && node -v"); !strings.Contains(out, "v22.") {
		t.Fatalf("the project runs on the major it pinned: %q", out)
	}

	if out := ssh(t, dev, "cd /home/dev/projects/"+project+" && git status --porcelain --ignored"); !strings.Contains(out, "!! mise.local.toml") {
		t.Fatalf("the pin must be ignored by git, not left untracked: %q", out)
	}

	refused := agent(t, host, request{Cmd: "project.update", Params: map[string]any{"name": project, "patch": map[string]any{"runtimes": map[string]any{"node": "20"}}}})[0]
	if refused.OK || !strings.Contains(decode[protocol.Error](t, refused.Error).Fix, "Node.js") {
		t.Fatalf("a major the machine does not hold is refused with the service to open: %s", refused.Error)
	}

	agent(t, host, request{Cmd: "project.update", Params: map[string]any{"name": project, "patch": map[string]any{"runtimes": map[string]any{}}}})
	if out := ssh(t, dev, "cd /home/dev/projects/"+project+" && node -v"); !strings.Contains(out, "v24.") {
		t.Fatalf("a project that names no version runs on the default: %q", out)
	}
}
