package tmux_test

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/tmux"
)

const logPath = "/home/dev/.pupitre/logs/web.log"

var options = tmux.Options{Now: modtest.NewClock(0).Now}

func newContext(fake *modtest.FakeSys) sys.Context {
	return modtest.NewSysContext(fake)
}

func web() tmux.Job {
	return tmux.Job{Project: "web", Dir: "/home/dev/projects/web", Cmd: "bun run dev --port 3000"}
}

func TestStartOpensAWindowAndItsLog(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Serves("web", 3000)
	ctx := newContext(fake)

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}

	if _, open := fake.Windows["web"]; !open {
		t.Fatalf("no window opened: %v", fake.Mutations)
	}
	if fake.Sessions["pupitre"] != true {
		t.Fatal("the session must be pupitre")
	}
	if !strings.Contains(string(fake.Files[logPath]), "=== pupitre up ") {
		t.Fatalf("the start marker must open the log:\n%s", fake.Files[logPath])
	}

	commands := strings.Join(fake.Commands(), "\n")
	if !strings.Contains(commands, "tmux pipe-pane -o -t pupitre:web cat >> "+logPath) {
		t.Fatalf("the output must be piped into the project's log:\n%s", commands)
	}
	if !strings.Contains(commands, "bun run dev --port 3000") {
		t.Fatalf("the project's command must be sent to its window:\n%s", commands)
	}
}

func TestStopClosesTheWindowAndTracesIt(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Serves("web", 3000)
	ctx := newContext(fake)

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}
	if err := tmux.Stop(ctx, options, "web"); err != nil {
		t.Fatal(err)
	}

	if _, open := fake.Windows["web"]; open {
		t.Fatal("the window must be gone")
	}
	if !strings.Contains(string(fake.Files[logPath]), "=== pupitre down ") {
		t.Fatalf("a shutdown must leave a trace in the log:\n%s", fake.Files[logPath])
	}
}

func TestCollectReadsTheMachineOnce(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Serves("web", 3000)
	ctx := newContext(fake)

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}

	before := len(fake.Calls)
	collected := tmux.Collect(ctx, options)

	if calls := len(fake.Calls) - before; calls != 3 {
		t.Fatalf("got %d calls, want one tmux, one ss and one ps: %v", calls, fake.Commands()[before:])
	}
	if !collected.Running("web") || !collected.PortUp(3000) {
		t.Fatalf("unexpected collection: %+v", collected)
	}
	if collected.PID("web") == 0 || collected.Seconds("web") == 0 {
		t.Fatalf("the pane pid and its age must be read: %+v", collected)
	}
}

func TestStateFollowsTheWindowAndThePort(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(fake)
	project := contract.Project{Name: "web", Port: 3000, PkgMgr: "bun"}

	if got := tmux.State(ctx, options, project, tmux.Collect(ctx, options)); got != contract.ProjectStopped {
		t.Fatalf("no window, no port: got %s", got)
	}

	fake.Listen[3000] = true
	if got := tmux.State(ctx, options, project, tmux.Collect(ctx, options)); got != contract.ProjectExternal {
		t.Fatalf("a port answering outside our session is external: got %s", got)
	}

	fake.Listen[3000] = false
	fake.Serves("web", 3000)
	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}
	if got := tmux.State(ctx, options, project, tmux.Collect(ctx, options)); got != contract.ProjectOnline {
		t.Fatalf("window and port: got %s", got)
	}

	delete(fake.Listen, 3000)
	if got := tmux.State(ctx, options, project, tmux.Collect(ctx, options)); got != contract.ProjectStarting {
		t.Fatalf("a window with no port yet is starting: got %s", got)
	}

	fake.Files[logPath] = append(fake.Files[logPath], []byte("Error: listen EADDRINUSE 127.0.0.1:3000\n")...)
	if got := tmux.State(ctx, options, project, tmux.Collect(ctx, options)); got != contract.ProjectFailed {
		t.Fatalf("a terminal error in the log is a failure: got %s", got)
	}
}

func TestAServiceRowIsNeverStarting(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(fake)
	shots := contract.Project{Name: "shots", Port: 8099, PkgMgr: "service"}

	if got := tmux.State(ctx, options, shots, tmux.Collect(ctx, options)); got != contract.ProjectStopped {
		t.Fatalf("got %s", got)
	}

	fake.Listen[8099] = true
	if got := tmux.State(ctx, options, shots, tmux.Collect(ctx, options)); got != contract.ProjectService {
		t.Fatalf("got %s", got)
	}
}

func TestAnErrorBeforeTheLastStartIsForgotten(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[logPath] = []byte("Cannot find module 'vite'\n")
	ctx := newContext(fake)

	if !tmux.Failed(ctx, options, "web") {
		t.Fatal("a fatal line must be seen")
	}

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}
	if tmux.Failed(ctx, options, "web") {
		t.Fatalf("only what follows the last start marker counts:\n%s", fake.Files[logPath])
	}
}

func TestLogsReturnTheTailAndRefuseAnUnknownProject(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[logPath] = []byte("one\ntwo\nthree\n")
	ctx := newContext(fake)

	lines, err := tmux.Logs(ctx, options, "web", 2)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(lines, " ") != "two three" {
		t.Fatalf("got %q", lines)
	}

	if _, err := tmux.Logs(ctx, options, "ghost", 0); err == nil {
		t.Fatal("a project that never started has no log")
	}
}
