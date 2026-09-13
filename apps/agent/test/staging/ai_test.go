//go:build staging

package staging

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
)

const providerKey = "sk-staging-s3cret-de-test"

var aiInstall = request{Cmd: "install", Params: map[string]any{
	"modules":       []string{"ai.claude", "ai.codex", "ai.cursor", "ai.gemini", "ai.copilot", "ai.opencode", "ai.hermes", "ai.browser"},
	"secrets_stdin": true,
	"config": map[string]any{
		"core.system":    map[string]any{"timezone": "Europe/Paris", "git_name": "Pupitre Staging", "git_email": "staging@pupitre.studio"},
		"runtime.node":   map[string]any{"node_version": "22", "bun": true, "pnpm": true},
		"runtime.python": map[string]any{"python_version": "3.12"},
		"ai.hermes":      map[string]any{"always_on": true},
	},
}}

const aiSecrets = `{"ai.hermes":{"providers.0":"openai:` + providerKey + `"}}`

func installAgents(t *testing.T, host string) response {
	t.Helper()

	first := agentWithSecrets(t, host, aiSecrets, aiInstall)[0]
	if result := decode[contract.InstallResult](t, first.Result); len(result.Failed) != 0 {
		t.Fatalf("install failed: %v", result.Failed)
	}

	return first
}

func TestTheSevenAgentsAnswerForDev(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	installAgents(t, host)

	for program, want := range map[string]string{"claude": "", "codex": "", "cursor-agent": "", "gemini": "", "copilot": "", "opencode": "", "hermes": ""} {
		out := ssh(t, dev, program+" --version")
		if strings.TrimSpace(out) == "" || (want != "" && !strings.Contains(out, want)) {
			t.Errorf("%s --version said nothing:\n%s", program, out)
		}
	}

	skills := ssh(t, dev, "ls ~/.agents/skills")
	for _, skill := range []string{"branch", "capture", "pr", "server-dev", "ship"} {
		if !strings.Contains(skills, skill) {
			t.Errorf("the skill %s is missing:\n%s", skill, skills)
		}
	}

	for _, path := range []string{"~/.claude/CLAUDE.md", "~/.codex/AGENTS.md", "~/.config/opencode/AGENTS.md", "~/.gemini/GEMINI.md", "~/.copilot/copilot-instructions.md"} {
		if out := ssh(t, dev, "cat "+path); !strings.Contains(out, "serveur Linux") {
			t.Errorf("%s does not carry the machine context:\n%s", path, out)
		}
	}

	if out := ssh(t, dev, "ls ~/.cursor/skills ~/.config/opencode/skills"); !strings.Contains(out, "server-dev") {
		t.Errorf("Cursor and OpenCode read the skills from their own folder:\n%s", out)
	}
}

// Neither CLI holds an account on a fresh machine, and each says so through its own check rather than by guessing.
func TestCursorAndOpencodeReportSignedOut(t *testing.T) {
	host := stagingHost(t)

	installAgents(t, host)

	for id, fix := range map[string]string{"ai.cursor": "cursor-agent login", "ai.opencode": "opencode auth login"} {
		answered := agent(t, host, request{Cmd: "service.status", Params: map[string]any{"id": id}})[0]
		status := decode[contract.ServiceStatus](t, answered.Result)

		if status.Login == nil || status.Login.State != contract.LoginSignedOut || !strings.Contains(status.Login.Fix, fix) {
			t.Errorf("%s: login = %+v", id, status.Login)
		}
	}
}

func TestReplayingTheInstallChangesNothing(t *testing.T) {
	host := stagingHost(t)

	installAgents(t, host)
	second := installAgents(t, host)

	if changed := steps(second, contract.StepOK); len(changed) != 0 {
		t.Fatalf("a replay must only skip, these ran again: %v", changed)
	}
}

func TestAShotShowsUpInTheGallery(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	installAgents(t, host)

	printed := ssh(t, dev, "shot https://example.org")
	lines := strings.Fields(strings.TrimSpace(printed))
	if len(lines) == 0 || !strings.HasPrefix(lines[len(lines)-1], "http") {
		t.Fatalf("the last line printed is the URL:\n%s", printed)
	}

	listed := agent(t, host, request{Cmd: "shots.list"})[0]
	shots := decode[struct {
		Shots []contract.Shot `json:"shots"`
	}](t, listed.Result)

	if len(shots.Shots) == 0 || !strings.Contains(shots.Shots[0].Name, "example-org") {
		t.Fatalf("shots.list must show the capture: %+v", shots.Shots)
	}

	served := ssh(t, dev, "curl", "-fsS", "http://127.0.0.1:8099/")
	if !strings.Contains(served, shots.Shots[0].Path[:10]) {
		t.Fatalf("the gallery must serve the day of the capture:\n%s", served)
	}
}

func TestOpeningAnAgentGivesTheTmuxCommand(t *testing.T) {
	host := stagingHost(t)

	installAgents(t, host)
	agent(t, host, request{Cmd: "project.add", Params: map[string]any{"name": "fixture", "dir": "fixture", "pkgmgr": "bun", "port": 3100}})

	opened := agent(t, host, request{Cmd: "agent.open", Params: map[string]any{"kind": "claude", "project": "fixture"}})[0]
	result := decode[struct {
		Command string `json:"command"`
		Session string `json:"session"`
	}](t, opened.Result)

	if result.Command != "tmux new-session -A -s claude-fixture -c /home/dev/projects/fixture claude" {
		t.Fatalf("unexpected command: %s", result.Command)
	}

	if result.Session != "claude-fixture" {
		t.Fatalf("unexpected session: %s", result.Session)
	}
}

func TestAJetbrainsBackendIsReportedAsAnIde(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	ssh(t, dev, "mkdir -p ~/.cache/JetBrains/RemoteDev/dist/idea/bin && printf '#!/bin/sh\\nsleep 120\\n' > ~/.cache/JetBrains/RemoteDev/dist/idea/bin/remote-dev-server.sh && chmod +x ~/.cache/JetBrains/RemoteDev/dist/idea/bin/remote-dev-server.sh")
	ssh(t, dev, "setsid ~/.cache/JetBrains/RemoteDev/dist/idea/bin/remote-dev-server.sh run >/dev/null 2>&1 &")
	t.Cleanup(func() { sshCommand(dev, "pkill", "-f", "remote-dev-server.sh").Run() })

	listed := agent(t, host, request{Cmd: "sessions.list"})[0]
	sessions := decode[struct {
		Sessions []contract.Session `json:"sessions"`
	}](t, listed.Result)

	found := false
	for _, session := range sessions.Sessions {
		if strings.Contains(session.Command, "remote-dev-server") {
			found = true
			if session.Kind != "ide" {
				t.Fatalf("a JetBrains backend is an ide, got %q", session.Kind)
			}
		}
	}

	if !found {
		t.Fatalf("the backend did not show up: %+v", sessions.Sessions)
	}
}

// The provider keys travel on the secret line: neither the report nor the journal may carry one back.
func TestProviderKeysStayOutOfTheReportAndTheJournal(t *testing.T) {
	host := stagingHost(t)

	installAgents(t, host)

	for _, path := range []string{"/var/lib/pupitre/report.json", "/var/log/pupitre.log", "/etc/systemd/system/pupitre-hermes.service"} {
		if out := ssh(t, host, "cat", path); strings.Contains(out, providerKey) {
			t.Fatalf("a provider key leaked into %s", path)
		}
	}

	if out := ssh(t, host, "stat", "-c", "%a", "/home/dev/.config/hermes/providers.env"); strings.TrimSpace(out) != "600" {
		t.Fatalf("the providers file must be 0600, got %s", out)
	}
}
