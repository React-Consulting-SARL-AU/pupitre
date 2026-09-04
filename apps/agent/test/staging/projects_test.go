//go:build staging

package staging

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/protocol"
)

const (
	vitePort    = 5199
	viteProject = "fixture-vite"
	viteDir     = "/home/dev/projects/" + viteProject
)

const vitePackageJSON = `{
  "name": "fixture-vite",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite" },
  "devDependencies": { "vite": "^7.1.0" }
}`

const viteIndexHTML = `<!doctype html><title>fixture</title><h1>fixture</h1>`

// A repository of fixture, laid down over ssh: the agent clones nothing here, and the folder leaves with the next reinstall.
func writeViteFixture(t *testing.T, host string) {
	t.Helper()

	ssh(t, host, "install", "-d", "-o", "dev", "-g", "dev", viteDir)
	write(t, host, viteDir+"/package.json", vitePackageJSON)
	write(t, host, viteDir+"/index.html", viteIndexHTML)
	ssh(t, host, "chown", "-R", "dev:dev", viteDir)
}

func write(t *testing.T, host, path, content string) {
	t.Helper()

	cmd := sshCommand(host, "sh", "-c", "'cat > "+path+"'")
	cmd.Stdin = strings.NewReader(content)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("writing %s on %s: %v\n%s", path, host, err, out)
	}
}

func addVite(name string, port int) request {
	return request{Cmd: "project.add", Params: map[string]any{
		"name":   name,
		"dir":    name,
		"pkgmgr": "bun",
		"host":   "127.0.0.1",
		"port":   port,
		"cmd":    fmt.Sprintf("bun run dev -- --host 127.0.0.1 --port %d", port),
	}}
}

func projectIn(t *testing.T, snapshot contract.Snapshot, name string) contract.Project {
	t.Helper()

	for _, project := range snapshot.Projects {
		if project.Name == name {
			return project
		}
	}

	t.Fatalf("%s missing from the snapshot", name)

	return contract.Project{}
}

func snapshotOf(t *testing.T, host string) contract.Snapshot {
	t.Helper()

	return decode[contract.Snapshot](t, agent(t, host, request{Cmd: "snapshot"})[0].Result)
}

func cleanup(t *testing.T, host, name string) {
	t.Helper()

	t.Cleanup(func() {
		attempt(t, host, request{Cmd: "project.down", Params: map[string]any{"name": name}})
		attempt(t, host, request{Cmd: "project.remove", Params: map[string]any{"name": name}})
	})
}

func TestAViteProjectGoesFromAddedToOnlineAndBack(t *testing.T) {
	host := stagingHost(t)
	writeViteFixture(t, host)
	cleanup(t, host, viteProject)

	added := agent(t, host, addVite(viteProject, vitePort))[0]
	declared := decode[contract.Project](t, added.Result)
	if declared.State != contract.ProjectStopped || declared.Install != "bun install" {
		t.Fatalf("unexpected registration: %+v", declared)
	}
	// The fixture declares no repository: an unversioned project carries its folder like any other.
	if declared.Path != "/home/dev/projects/"+viteProject {
		t.Fatalf("unexpected path: %+v", declared)
	}

	agent(t, host, request{Cmd: "project.install", Params: map[string]any{"name": viteProject}})

	online := timed(t, "project.up until online", func() {
		agent(t, host, request{Cmd: "project.up", Params: map[string]any{"name": viteProject}})
		waitFor(t, host, viteProject, contract.ProjectOnline, 30*time.Second)
	})
	if online > 30*time.Second {
		t.Fatalf("the project took %s to come online, the budget is 30 s", online)
	}

	current := projectIn(t, snapshotOf(t, host), viteProject)
	if current.Port != vitePort || current.URL == "" || current.Path != declared.Path {
		t.Fatalf("the snapshot must show the port, the address and the folder: %+v", current)
	}

	logs := decode[struct {
		Lines []string `json:"lines"`
	}](t, agent(t, host, request{Cmd: "project.logs", Params: map[string]any{"name": viteProject, "lines": 50}})[0].Result)
	if !strings.Contains(strings.Join(logs.Lines, "\n"), "VITE") {
		t.Fatalf("project.logs must return the dev server's own output:\n%s", strings.Join(logs.Lines, "\n"))
	}

	agent(t, host, request{Cmd: "project.down", Params: map[string]any{"name": viteProject}})
	waitFor(t, host, viteProject, contract.ProjectStopped, 15*time.Second)

	if listening := ssh(t, host, "ss", "-ltn"); strings.Contains(listening, fmt.Sprintf(":%d", vitePort)) {
		t.Fatalf("the port must be free once the project is down:\n%s", listening)
	}
}

func waitFor(t *testing.T, host, name string, want contract.ProjectState, limit time.Duration) {
	t.Helper()

	deadline := time.Now().Add(limit)
	var last contract.ProjectState

	for time.Now().Before(deadline) {
		last = projectIn(t, snapshotOf(t, host), name).State
		if last == want {
			return
		}

		if last == contract.ProjectFailed {
			break
		}

		time.Sleep(time.Second)
	}

	t.Fatalf("%s is %s after %s, want %s", name, last, limit, want)
}

func TestSnapshotAnswersUnderThreeHundredMillisecondsWithTenProjects(t *testing.T) {
	host := stagingHost(t)

	for i := range 10 {
		name := fmt.Sprintf("fixture-load-%d", i)
		cleanup(t, host, name)
		agent(t, host, addVite(name, 5200+i))
	}

	snapshot := snapshotOf(t, host)
	if len(snapshot.Projects) < 10 {
		t.Fatalf("got %d projects, want at least the ten of the fixture", len(snapshot.Projects))
	}

	// The first call warms the page cache of /proc and the tmux server; the dashboard reads every three seconds, never once.
	slowest := time.Duration(0)
	for range 5 {
		elapsed := timed(t, "snapshot", func() { snapshotOf(t, host) })
		if elapsed > slowest {
			slowest = elapsed
		}
	}

	if slowest > 300*time.Millisecond {
		t.Fatalf("the slowest snapshot took %s, the budget is 300 ms", slowest)
	}
}

func TestTwoProjectsOnTheSamePortAreRefusedWithAFix(t *testing.T) {
	host := stagingHost(t)
	cleanup(t, host, "fixture-first")
	cleanup(t, host, "fixture-twin")

	agent(t, host, addVite("fixture-first", 5300))

	refused := attempt(t, host, addVite("fixture-twin", 5300))[0]
	if refused.OK {
		t.Fatal("two projects on the same port must be refused")
	}

	failure := decode[protocol.Error](t, refused.Error)
	if failure.Code != contract.ErrorBadRequest {
		t.Fatalf("got %s", failure.Code)
	}
	if !strings.Contains(failure.Message, "fixture-first") || failure.Fix == "" {
		t.Fatalf("the refusal must name the holder and carry a fix: %+v", failure)
	}

	for _, project := range snapshotOf(t, host).Projects {
		if project.Name == "fixture-twin" {
			t.Fatal("a refused project must not reach the registry")
		}
	}
}

func TestTheRegistryOfTheRepositoryIsNeverRewritten(t *testing.T) {
	host := stagingHost(t)
	cleanup(t, host, "fixture-local")

	before := ssh(t, host, "cat", "/etc/pupitre/projects.conf")
	agent(t, host, addVite("fixture-local", 5400))

	if after := ssh(t, host, "cat", "/etc/pupitre/projects.conf"); after != before {
		t.Fatal("project.add writes /etc/pupitre/projects.local.conf and nothing else")
	}

	local := ssh(t, host, "cat", "/etc/pupitre/projects.local.conf")
	if !strings.Contains(local, "fixture-local|fixture-local|-|bun|127.0.0.1|5400") {
		t.Fatalf("the row must be in the local registry, in the format of projects.conf:\n%s", local)
	}

	removed := agent(t, host, request{Cmd: "project.remove", Params: map[string]any{"name": "fixture-local"}})[0]
	if !strings.Contains(string(removed.Result), "fixture-local") {
		t.Fatalf("project.remove must report the folder it leaves behind: %s", removed.Result)
	}
	// ssh fails the test on a non-zero exit: the folder must still be there for project.remove to have kept its word.
	ssh(t, host, "ls", "-d", "/home/dev/projects/fixture-local")
}
