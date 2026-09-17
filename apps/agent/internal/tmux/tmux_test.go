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
	if !strings.Contains(commands, "pipe-pane -o -t =pupitre:=web/web cat >> "+logPath) {
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

	if calls := len(fake.Calls) - before; calls != 2 {
		t.Fatalf("got %d calls, want one tmux and one ps: %v", calls, fake.Commands()[before:])
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

func TestStartRunsTheCommandAsTheWindowAndKeepsItsCorpse(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Serves("web/web", 3000)
	ctx := newContext(fake)

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}

	var opening []string
	for _, call := range fake.Calls {
		if len(call.Argv) > 1 && call.Argv[0] == "tmux" && call.Argv[1] == "new-window" {
			opening = call.Argv
		}
	}
	if opening == nil {
		t.Fatalf("no window opened: %v", fake.Commands())
	}

	line := strings.Join(opening, " ")
	for _, want := range []string{
		"-e PUPITRE_CMD=bun run dev --port 3000",
		`exec /usr/bin/zsh -lc "$PUPITRE_CMD"`,
		"; set-option -w -t =pupitre:=web/web remain-on-exit on",
		"; pipe-pane -o -t =pupitre:=web/web cat >> " + logPath,
	} {
		if !strings.Contains(line, want) {
			t.Errorf("the window must run the command itself, keep its pane once it exits and pipe its output, all in one call — missing %q:\n%s", want, line)
		}
	}
	if strings.Index(line, "remain-on-exit") > strings.Index(line, "pipe-pane") {
		t.Fatalf("the corpse must be kept before anything of the output is read:\n%s", line)
	}

	for _, call := range fake.Calls {
		if len(call.Argv) > 1 && call.Argv[0] == "tmux" && call.Argv[1] == "send-keys" {
			t.Fatalf("nothing is typed into a shell any more: %v", call.Argv)
		}
	}
}

func TestAWindowWhoseCommandExitedIsNotStarting(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(fake)
	state := func() contract.ProcessState {
		return tmux.State(ctx, options, "web/web", "bun", 3000, tmux.Collect(ctx, options))
	}

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}
	if got := state(); got != contract.ProcessStarting {
		t.Fatalf("alive with no port yet: got %s", got)
	}

	fake.Dies("web/web", 1)
	if got := state(); got != contract.ProcessFailed {
		t.Fatalf("a command that exited with 1 has failed, whatever its log says: got %s", got)
	}
	if collected := tmux.Collect(ctx, options); collected.Running("web/web") || collected.PID("web/web") != 0 || collected.Seconds("web/web") != 0 {
		t.Fatalf("a dead pane runs nothing: %+v", collected)
	}

	fake.Dies("web/web", 0)
	if got := state(); got != contract.ProcessStopped {
		t.Fatalf("a command that exited with 0 has stopped: got %s", got)
	}

	fake.Dies("web/web", -1)
	if got := state(); got != contract.ProcessFailed {
		t.Fatalf("a command a signal ended has failed: got %s", got)
	}
}

func TestStartReplacesADeadWindow(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(fake)

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}
	fake.Dies("web/web", 1)

	if tmux.Running(ctx, options, "web/web") {
		t.Fatal("a dead window is not running")
	}

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}

	if _, dead := fake.Dead["web/web"]; dead {
		t.Fatalf("the corpse must have been cleared: %v", fake.Mutations)
	}
	if !tmux.Running(ctx, options, "web/web") {
		t.Fatal("the window must be open again")
	}

	commands := strings.Join(fake.Commands(), "\n")
	if strings.Count(commands, "tmux kill-window") != 1 {
		t.Fatalf("the dead window must be killed once, and only it:\n%s", commands)
	}
}

func TestStopClearsADeadWindowWithoutASignal(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(fake)

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}
	fake.Dies("web/web", 1)

	if err := tmux.Stop(ctx, options, "web/web"); err != nil {
		t.Fatal(err)
	}

	if _, open := fake.Windows["web/web"]; open {
		t.Fatal("the window must be gone")
	}
	for _, call := range fake.Calls {
		if len(call.Argv) > 1 && call.Argv[0] == "tmux" && call.Argv[1] == "send-keys" {
			t.Fatalf("nothing to interrupt in a dead pane: %v", call.Argv)
		}
	}
	if !strings.Contains(string(fake.Files[logPath]), "=== pupitre down ") {
		t.Fatalf("a shutdown must leave a trace in the log:\n%s", fake.Files[logPath])
	}
}

// A journal is bounded by its start: what the previous run wrote is gone with it, and the file stays the user's.
func TestStartTruncatesTheLogOfThePreviousRun(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[logPath] = []byte(strings.Repeat("a line of the previous run\n", 1000))
	fake.Owners[logPath] = "dev:dev"
	ctx := newContext(fake)

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}

	log := string(fake.Files[logPath])
	if strings.Contains(log, "previous run") || !strings.HasPrefix(strings.TrimSpace(log), "=== pupitre up ") {
		t.Fatalf("the log must hold this run alone:\n%s", log)
	}
	if fake.Owners[logPath] != "dev:dev" {
		t.Fatalf("the log belongs to the user whose pane appends to it, got %q", fake.Owners[logPath])
	}
}

// A pane the user split off the window is not the process: only the first
// pane of each window is read, and it is told apart in the answer, never by a
// pane index the machine's tmux.conf may start at 1.
func TestCollectReadsTheFirstPaneOfEachWindow(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Serves("web/web", 3000)
	ctx := newContext(fake)

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}
	fake.Splits("web/web")

	collected := tmux.Collect(ctx, options)

	if !collected.Running("web/web") || collected.PID("web/web") != fake.Windows["web/web"] {
		t.Fatalf("the window's own pane must be read, not the split: %+v", collected.Windows)
	}

	commands := strings.Join(fake.Commands(), "\n")
	if strings.Contains(commands, " -f ") {
		t.Fatalf("no pane index filter may be asked of tmux:\n%s", commands)
	}
}

// Two windows under one name are what a start that could not close the last
// one leaves behind; tmux refuses the name as ambiguous, so the window is
// addressed by its id, and a stop closes every one of them.
func TestStopClosesEveryWindowOfTheName(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Serves("web/web", 3000)
	ctx := newContext(fake)

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}
	fake.Duplicates("web/web")

	if !tmux.Running(ctx, options, "web/web") {
		t.Fatal("a duplicated window still runs its first pane")
	}

	if err := tmux.Stop(ctx, options, "web/web"); err != nil {
		t.Fatal(err)
	}

	if _, open := fake.Windows["web/web"]; open || len(fake.Twins["web/web"]) != 0 {
		t.Fatalf("every window of the name must be closed: %v %v", fake.Windows, fake.Twins)
	}

	commands := strings.Join(fake.Commands(), "\n")
	if strings.Contains(commands, "kill-window -t =pupitre:=web/web") {
		t.Fatalf("a duplicated name is never a target:\n%s", commands)
	}
}

// Every target is exact: a session or a window whose name merely begins the same way is never the one addressed.
func TestEveryTargetIsExact(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Serves("web/web", 3000)
	ctx := newContext(fake)

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}
	if err := tmux.Stop(ctx, options, "web/web"); err != nil {
		t.Fatal(err)
	}

	for _, command := range fake.Commands() {
		if !strings.HasPrefix(command, "(dev) tmux") {
			continue
		}

		if strings.Contains(command, " -t pupitre") || strings.Contains(command, ":web/web") && !strings.Contains(command, ":=web/web") {
			t.Fatalf("a target must carry tmux's exact-match marker: %s", command)
		}
	}

	if _, open := fake.Windows["web/web"]; open {
		t.Fatalf("the exact target must still reach the window: %v", fake.Mutations)
	}
}

// What listens is read off the kernel's own table, the one the registry and the detection read: never ss, which sees the sockets of other namespaces too.
func TestListeningIsReadFromTheKernelTable(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Serves("web/web", 3000)
	ctx := newContext(fake)

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}

	collected := tmux.Collect(ctx, options)
	if !collected.PortUp(3000) || collected.PortUp(3001) {
		t.Fatalf("unexpected listening set: %+v", collected.Listening)
	}

	for _, command := range fake.Commands() {
		if strings.HasPrefix(command, "ss ") {
			t.Fatalf("ss must not be run: %s", command)
		}
	}
}
