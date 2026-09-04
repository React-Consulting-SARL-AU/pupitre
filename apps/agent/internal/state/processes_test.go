package state_test

import (
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/state"
)

const agentPID = 900

func agentFixture(t *testing.T) (*modtest.FakeSys, *state.Reader) {
	t.Helper()

	fake := modtest.NewFakeSys()
	machine(fake)
	fake.Files[registry.DefaultConf] = []byte(conf)
	fake.Dirs["/home/dev/projects/web"] = true
	fake.Serves("web", 3000)
	fake.Spawn(modtest.Proc{PID: 1, PPID: 0, User: "root", RSS: 8 * 1024, Args: "/sbin/init"})
	fake.Spawn(modtest.Proc{PID: agentPID, PPID: 1, User: "root", RSS: 16 * 1024, Args: "/usr/local/bin/pupitred serve"})

	reader := state.New(state.Options{
		Sys:          fake,
		Now:          modtest.NewClock(time.Millisecond).Now,
		Registry:     modules.NewRegistry(),
		AgentVersion: "0.0.0-test",
		Self:         func() int { return agentPID },
		Sleep:        func(time.Duration) {},
	})

	return fake, reader
}

func sessionFixture(t *testing.T) (*modtest.FakeSys, *state.Reader) {
	t.Helper()

	fake, reader := agentFixture(t)
	fake.Spawn(modtest.Proc{PID: 5100, PPID: 1, RSS: 512 * 1024, Etimes: 90, CPU: 3.5, Args: "/home/dev/.local/bin/claude --resume"})
	fake.Spawn(modtest.Proc{PID: 5200, PPID: 1, RSS: 256 * 1024, Etimes: 30, CPU: 1.5, Args: "/home/dev/.local/bin/codex exec"})
	fake.Spawn(modtest.Proc{PID: 5300, PPID: 1, RSS: 3072 * 1024, Etimes: 8 * 3600, CPU: 0.5, Args: "/home/dev/.cache/JetBrains/RemoteDev/dist/idea/bin/remote-dev-server.sh run"})
	fake.Spawn(modtest.Proc{PID: 5400, PPID: 1, RSS: 4 * 1024, Etimes: 12, Args: "/usr/bin/vim notes.md"})

	return fake, reader
}

func TestSessionsTellTheKindsApartAndIgnoreEverythingElse(t *testing.T) {
	_, reader := sessionFixture(t)

	sessions := reader.Sessions()
	if len(sessions) != 3 {
		t.Fatalf("got %d sessions, want the agent, the assistant and the IDE backend: %+v", len(sessions), sessions)
	}

	kinds := map[int]string{}
	for _, session := range sessions {
		kinds[session.PID] = session.Kind
	}

	for pid, want := range map[int]string{5100: "claude", 5200: "codex", 5300: "shell"} {
		if kinds[pid] != want {
			t.Errorf("pid %d: got kind %q, want %q", pid, kinds[pid], want)
		}
	}

	if sessions[0].RAMMB != 512 || sessions[0].Seconds != 90 {
		t.Errorf("unexpected reading %+v", sessions[0])
	}
}

func TestSessionsCleanStopsOnlyTheOldOnes(t *testing.T) {
	fake, reader := sessionFixture(t)

	if killed := reader.CleanSessions(); killed != 1 {
		t.Fatalf("got %d killed, want the eight-hour IDE backend alone", killed)
	}

	if strings.Join(fake.Signals, " ") != "-TERM 5300" {
		t.Fatalf("unexpected signals %v", fake.Signals)
	}

	if !fake.Alive(5100) || !fake.Alive(5200) {
		t.Fatal("a session younger than the threshold must be left alone")
	}
}

func TestSessionsAndProjectsShareTheProcessTree(t *testing.T) {
	fake, reader := agentFixture(t)
	if _, err := reader.Up("web"); err != nil {
		t.Fatal(err)
	}

	pane := fake.Windows["web"]
	fake.Spawn(modtest.Proc{PID: pane, PPID: 1, RSS: 12 * 1024, Etimes: 42, Args: "/bin/zsh"})
	fake.Spawn(modtest.Proc{PID: 6100, PPID: pane, RSS: 100 * 1024, Args: "/home/dev/.bun/bin/bun run dev --port 3000"})
	fake.Spawn(modtest.Proc{PID: 6200, PPID: 6100, RSS: 400 * 1024, Args: "/home/dev/.local/share/mise/installs/node/22/bin/node vite"})
	fake.Spawn(modtest.Proc{PID: 6300, PPID: 6200, RSS: 88 * 1024, Etimes: 20, Args: "/home/dev/.local/bin/claude"})

	web := projectOf(t, reader.Snapshot().Projects, "web")
	if web.RAMMB != 12+100+400+88 {
		t.Fatalf("got %d MB, want the whole tree under the pane", web.RAMMB)
	}

	sessions := reader.Sessions()
	if len(sessions) != 1 || sessions[0].Project != "web" {
		t.Fatalf("a session started inside a pane belongs to its project: %+v", sessions)
	}
}

func TestProcessesListNamesTheProjectAndOrdersByCPU(t *testing.T) {
	fake, reader := sessionFixture(t)
	if _, err := reader.Up("web"); err != nil {
		t.Fatal(err)
	}

	pane := fake.Windows["web"]
	fake.Spawn(modtest.Proc{PID: 6100, PPID: pane, RSS: 100 * 1024, CPU: 91.5, Args: "/home/dev/.bun/bin/bun run dev --port 3000"})

	processes := reader.Processes()
	if len(processes) == 0 || processes[0].PID != 6100 {
		t.Fatalf("the busiest process comes first: %+v", processes)
	}

	if processes[0].Project != "web" || processes[0].Command != "bun" || processes[0].RAMMB != 100 {
		t.Fatalf("unexpected row %+v", processes[0])
	}
}

func TestKillRefusesWhatIsNotTheProjectsUser(t *testing.T) {
	fake, reader := agentFixture(t)
	fake.Spawn(modtest.Proc{PID: 7000, PPID: 1, User: "root", RSS: 4 * 1024, Args: "/usr/sbin/cron -f"})

	err := reader.Kill(7000, false)
	if err == nil {
		t.Fatal("a process of another user must never be stopped from Pupitre")
	}

	if !strings.Contains(err.Error(), "root") {
		t.Fatalf("the message must name the owner: %v", err)
	}

	if len(fake.Signals) != 0 || !fake.Alive(7000) {
		t.Fatalf("nothing must have been signalled: %v", fake.Signals)
	}
}

func TestKillRefusesTheCarriersAndItsOwnAncestry(t *testing.T) {
	fake, reader := agentFixture(t)
	fake.Spawn(modtest.Proc{PID: 7100, PPID: 1, RSS: 2 * 1024, Args: "/usr/bin/tmux new-session"})
	fake.Spawn(modtest.Proc{PID: 7200, PPID: 1, RSS: 2 * 1024, Args: "/usr/bin/mosh-server new"})
	fake.Spawn(modtest.Proc{PID: agentPID, PPID: 7200, RSS: 16 * 1024, Args: "/usr/local/bin/pupitred serve"})

	for _, pid := range []int{7100, 7200, agentPID, 1, 0} {
		if err := reader.Kill(pid, false); err == nil {
			t.Errorf("pid %d must be refused", pid)
		}
	}

	if len(fake.Signals) != 0 {
		t.Fatalf("nothing must have been signalled: %v", fake.Signals)
	}
}

func TestKillTermsThenKillsWhenForced(t *testing.T) {
	fake, reader := agentFixture(t)
	fake.Spawn(modtest.Proc{PID: 7300, PPID: 1, RSS: 900 * 1024, Args: "/home/dev/.gradle/daemon/gradle"})
	fake.Spawn(modtest.Proc{PID: 7400, PPID: 1, RSS: 900 * 1024, Args: "/home/dev/.gradle/daemon/gradle"})
	fake.Stubborn[7400] = true

	if err := reader.Kill(7300, false); err != nil {
		t.Fatal(err)
	}

	if err := reader.Kill(7400, true); err != nil {
		t.Fatal(err)
	}

	if strings.Join(fake.Signals, " ") != "-TERM 7300 -TERM 7400 -KILL 7400" {
		t.Fatalf("unexpected signals %v", fake.Signals)
	}
}
