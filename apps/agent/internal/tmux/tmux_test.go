package tmux_test

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/tmux"
)

const logPath = "/home/dev/.pupitre/logs/web/web.log"

var options = tmux.Options{Now: modtest.NewClock(0).Now}

func newContext(fake *modtest.FakeSys) sys.Context {
	return modtest.NewSysContext(fake)
}

func web() tmux.Job {
	return tmux.Job{Window: "web/web", Dir: "/home/dev/projects/web", Cmd: "bun run dev --port 3000"}
}

func TestStartOpensAWindowAndItsLog(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Serves("web/web", 3000)
	ctx := newContext(fake)

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}

	if _, open := fake.Windows["web/web"]; !open {
		t.Fatalf("no window opened: %v", fake.Mutations)
	}
	if fake.Sessions["pupitre"] != true {
		t.Fatal("the session must be pupitre")
	}
	if !strings.Contains(string(fake.Files[logPath]), "=== pupitre up ") {
		t.Fatalf("the start marker must open the log:\n%s", fake.Files[logPath])
	}

	commands := strings.Join(fake.Commands(), "\n")
	if !strings.Contains(commands, "tmux pipe-pane -o -t pupitre:web/web cat >> "+logPath) {
		t.Fatalf("the output must be piped into the process's log, under a folder of its project's name:\n%s", commands)
	}
	if !strings.Contains(commands, "bun run dev --port 3000") {
		t.Fatalf("the project's command must be sent to its window:\n%s", commands)
	}
}

func TestEveryTmuxCommandRunsAsTheProjectsUser(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Serves("web/web", 3000)
	ctx := newContext(fake)

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}
	if err := tmux.Stop(ctx, options, "web/web"); err != nil {
		t.Fatal(err)
	}
	tmux.Collect(ctx, options)
	tmux.Running(ctx, options, "web/web")

	seen := 0
	for _, call := range fake.Calls {
		if call.Argv[0] != "tmux" {
			continue
		}

		seen++
		if call.User != "dev" {
			t.Errorf("tmux ran as %q: %v", call.User, call.Argv)
		}

		env := strings.Join(call.Env, "\n")
		for _, want := range []string{"HOME=/home/dev", "USER=dev", "SHELL=/usr/bin/zsh"} {
			if !strings.Contains(env, want) {
				t.Errorf("tmux %v lacks %s: the server keeps the environment it was started with", call.Argv, want)
			}
		}
	}

	if seen < 6 {
		t.Fatalf("only %d tmux call(s) recorded", seen)
	}

	if owner, _ := fake.Owner("/home/dev/.pupitre/logs/web"); owner != "dev" {
		t.Fatalf("the log folder belongs to %s, want dev", owner)
	}

	if owner, _ := fake.Owner(logPath); owner != "dev" {
		t.Fatalf("the log belongs to %s, want dev: the markers are appended as the project's user", owner)
	}
}

func TestStopClosesTheWindowAndTracesIt(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Serves("web/web", 3000)
	ctx := newContext(fake)

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}
	if err := tmux.Stop(ctx, options, "web/web"); err != nil {
		t.Fatal(err)
	}

	if _, open := fake.Windows["web/web"]; open {
		t.Fatal("the window must be gone")
	}
	if !strings.Contains(string(fake.Files[logPath]), "=== pupitre down ") {
		t.Fatalf("a shutdown must leave a trace in the log:\n%s", fake.Files[logPath])
	}
}

func TestCollectReadsTheMachineOnce(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Serves("web/web", 3000)
	ctx := newContext(fake)

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}

	before := len(fake.Calls)
	collected := tmux.Collect(ctx, options)

	if calls := len(fake.Calls) - before; calls != 3 {
		t.Fatalf("got %d calls, want one tmux, one ss and one ps: %v", calls, fake.Commands()[before:])
	}
	if !collected.Running("web/web") || !collected.PortUp(3000) {
		t.Fatalf("unexpected collection: %+v", collected)
	}
	if collected.PID("web/web") == 0 || collected.Seconds("web/web") == 0 {
		t.Fatalf("the pane pid and its age must be read: %+v", collected)
	}
}

func TestStateFollowsTheWindowAndThePort(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(fake)
	state := func() contract.ProcessState {
		return tmux.State(ctx, options, "web/web", "bun", 3000, tmux.Collect(ctx, options))
	}

	if got := state(); got != contract.ProcessStopped {
		t.Fatalf("no window, no port: got %s", got)
	}

	fake.Listen[3000] = true
	if got := state(); got != contract.ProcessExternal {
		t.Fatalf("a port answering outside our session is external: got %s", got)
	}

	fake.Listen[3000] = false
	fake.Serves("web/web", 3000)
	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}
	if got := state(); got != contract.ProcessOnline {
		t.Fatalf("window and port: got %s", got)
	}

	delete(fake.Listen, 3000)
	if got := state(); got != contract.ProcessStarting {
		t.Fatalf("a window with no port yet is starting: got %s", got)
	}

	fake.Files[logPath] = append(fake.Files[logPath], []byte("Error: listen EADDRINUSE 127.0.0.1:3000\n")...)
	if got := state(); got != contract.ProcessFailed {
		t.Fatalf("a terminal error in the log is a failure: got %s", got)
	}
}

func TestAServiceRowIsNeverStarting(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(fake)
	state := func() contract.ProcessState {
		return tmux.State(ctx, options, "shots/shots", "service", 8099, tmux.Collect(ctx, options))
	}

	if got := state(); got != contract.ProcessDown {
		t.Fatalf("a service whose port does not answer is down, not stopped: got %s", got)
	}

	fake.Listen[8099] = true
	if got := state(); got != contract.ProcessService {
		t.Fatalf("got %s", got)
	}
}

func TestAnErrorBeforeTheLastStartIsForgotten(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[logPath] = []byte("Cannot find module 'vite'\n")
	ctx := newContext(fake)

	if !tmux.Failed(ctx, options, "web/web") {
		t.Fatal("a fatal line must be seen")
	}

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}
	if tmux.Failed(ctx, options, "web/web") {
		t.Fatalf("only what follows the last start marker counts:\n%s", fake.Files[logPath])
	}
}

func TestLogsReturnTheTailAndRefuseAnUnknownProject(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[logPath] = []byte("one\ntwo\nthree\n")
	ctx := newContext(fake)

	lines, err := tmux.Logs(ctx, options, "web/web", 2)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(lines, " ") != "two three" {
		t.Fatalf("got %q", lines)
	}

	if _, err := tmux.Logs(ctx, options, "ghost/ghost", 0); err == nil {
		t.Fatal("a project that never started has no log")
	}
}
