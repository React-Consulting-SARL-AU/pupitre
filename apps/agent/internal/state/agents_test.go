package state_test

import (
	"strconv"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/state"
)

const agentProjects = "web|web|-|bun|127.0.0.1|3000|web|bun run dev --port 3000\napi|api/server|-|bun|127.0.0.1|3001|api|bun run dev\n"

func agentReader(t *testing.T, fake *modtest.FakeSys, installed ...string) *state.Reader {
	t.Helper()

	registry := modules.NewRegistry()

	for _, id := range []string{"ai.claude", "ai.codex", "ai.cursor", "ai.gemini", "ai.copilot", "ai.opencode", "ai.hermes"} {
		registry.Register(modtest.Passing{ID: id})
	}

	for _, id := range installed {
		fake.Packages[strings.ReplaceAll(id, ".", "-")] = "1.0"
	}

	return state.New(state.Options{Sys: fake, Registry: registry})
}

func agentMachine(t *testing.T) *modtest.FakeSys {
	t.Helper()

	fake := modtest.NewFakeSys()
	fake.Files["/etc/pupitre/projects.conf"] = []byte(agentProjects)

	return fake
}

func projectEnvironment(name string, port int) string {
	return strings.Join([]string{
		"-e 'PUPITRE=1'",
		"-e 'PUPITRE_PROCESS_" + strings.ToUpper(name) + "_PORT=" + strconv.Itoa(port) + "'",
		"-e 'PUPITRE_PROCESS_" + strings.ToUpper(name) + "_URL=http://127.0.0.1:" + strconv.Itoa(port) + "'",
		"-e 'PUPITRE_PROJECT=" + name + "'",
		"-e 'PUPITRE_PROJECTS_DIR=/home/dev/projects'",
		"-e 'PUPITRE_PROJECT_DIR=/home/dev/projects/" + name + "'",
		"-e 'PUPITRE_PROJECT_URL=http://127.0.0.1:" + strconv.Itoa(port) + "'",
	}, " ")
}

func TestEachAgentOpensInTheProjectFolderWithItsEnvironment(t *testing.T) {
	reader := agentReader(t, agentMachine(t), "ai.claude", "ai.codex", "ai.cursor", "ai.gemini", "ai.copilot", "ai.opencode", "ai.hermes")
	env := projectEnvironment("web", 3000)

	for kind, want := range map[string]string{
		"claude":   "tmux new-session -A -s claude-web -c /home/dev/projects/web " + env + " claude",
		"codex":    "tmux new-session -A -s codex-web -c /home/dev/projects/web " + env + " codex",
		"hermes":   "tmux new-session -A -s hermes-web -c /home/dev/projects/web " + env + " hermes",
		"cursor":   "tmux new-session -A -s cursor-web -c /home/dev/projects/web " + env + " cursor-agent",
		"opencode": "tmux new-session -A -s opencode-web -c /home/dev/projects/web " + env + " opencode",
		"gemini":   "tmux new-session -A -s gemini-web -c /home/dev/projects/web " + env + " gemini",
		"copilot":  "tmux new-session -A -s copilot-web -c /home/dev/projects/web " + env + " copilot",
	} {
		opened, err := reader.OpenAgent(kind, "web")
		if err != nil {
			t.Fatalf("%s: %v", kind, err)
		}

		if opened.Command != want {
			t.Errorf("%s\n got: %s\nwant: %s", kind, opened.Command, want)
		}

		if opened.Session != kind+"-web" {
			t.Errorf("%s: session = %s", kind, opened.Session)
		}
	}
}

func TestTheFolderFollowsTheRegistry(t *testing.T) {
	opened, err := agentReader(t, agentMachine(t), "ai.claude").OpenAgent("claude", "api")
	if err != nil {
		t.Fatal(err)
	}

	if opened.Command != "tmux new-session -A -s claude-api -c /home/dev/projects/api "+projectEnvironment("api", 3001)+" claude" {
		t.Fatalf("unexpected command: %s", opened.Command)
	}
}

func TestOpeningRefusesWhatIsNotThere(t *testing.T) {
	reader := agentReader(t, agentMachine(t), "ai.claude")

	for _, refusal := range []struct {
		kind, project string
		code          contract.ErrorCode
	}{
		{"aider", "web", contract.ErrorBadRequest},
		{"claude", "absent", contract.ErrorProjectNotFound},
		{"codex", "web", contract.ErrorServiceNotFound},
	} {
		_, err := reader.OpenAgent(refusal.kind, refusal.project)

		var refused *protocol.Error
		if !errorAs(err, &refused) || refused.Code != refusal.code {
			t.Errorf("%s/%s: got %v, want %s", refusal.kind, refusal.project, err, refusal.code)
			continue
		}

		if refused.Fix == "" {
			t.Errorf("%s/%s: a refusal carries a fix", refusal.kind, refusal.project)
		}
	}
}

func errorAs(err error, target **protocol.Error) bool {
	refused, ok := err.(*protocol.Error)
	if ok {
		*target = refused
	}

	return ok
}
