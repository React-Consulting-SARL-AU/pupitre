package tmux

import (
	"regexp"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/net"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	DefaultSession = "pupitre"
	DefaultUser    = "dev"
	DefaultLines   = 120

	upMarker   = "=== pupitre up "
	downMarker = "=== pupitre down "

	// The command travels to its pane in the environment, never through a shell's quoting: what the app declared is what runs.
	commandKey = "PUPITRE_CMD"

	// A pane that lost its command by a signal has no status; tmux leaves the column blank and this stands for it.
	signalled = -1

	// A journal is read from its end, never whole: a server that logs for a day would otherwise be read entire at every snapshot.
	tailBytes = 256 * 1024

	// The pane the window was opened on runs the process; a pane the user split off it does not.
)

// Only terminal conditions: a healthy Grails spews ERROR lines for minutes, and reading those as a failure would show "failed" on a live project.
var fatal = regexp.MustCompile(`(?i)EADDRINUSE|address already in use|BUILD FAILED|FAILURE: Build failed|Web server failed to start|command not found|Cannot find module|exited with code`)

type Options struct {
	Session string
	User    string
	LogDir  string
	Grace   time.Duration
	Now     func() time.Time
}

func (o Options) Resolved() Options {
	if o.Session == "" {
		o.Session = DefaultSession
	}
	if o.User == "" {
		o.User = DefaultUser
	}
	if o.LogDir == "" {
		o.LogDir = user.Home(o.User) + "/.pupitre/logs"
	}
	if o.Now == nil {
		o.Now = time.Now
	}

	return o
}

// LogPath is the journal of one window: a window named <project>/<process> writes under a folder of its project's name.
func (o Options) LogPath(window string) string {
	return o.Resolved().LogDir + "/" + window + ".log"
}

// A Pane is one window of the session as tmux reports it: the pid its command runs under, or the status that command left when it is dead.
// A window's own pane, the first tmux prints for it, under the id every gesture
// addresses: a name may be carried by two windows when a stop failed, and tmux
// then refuses the name as ambiguous. Twins are the other windows of the name.
type Pane struct {
	ID     string
	PID    int
	Dead   bool
	Status int
	Twins  []string
}

// One read of the machine for every window: tmux, ss and ps once each, not once per process.
type Collection struct {
	Windows   map[string]Pane
	Listening map[int]bool
	Uptime    map[int]int
}

func Collect(ctx sys.Context, options Options) Collection {
	options = options.Resolved()

	collected := Collection{
		Windows:   windows(ctx, options),
		Listening: listening(ctx),
		Uptime:    map[int]int{},
	}

	pids := make([]string, 0, len(collected.Windows))
	for _, pane := range collected.Windows {
		if !pane.Dead {
			pids = append(pids, strconv.Itoa(pane.PID))
		}
	}

	if len(pids) > 0 {
		collected.Uptime = uptimes(ctx, pids)
	}

	return collected
}

// Running says the window holds a live command: a dead pane is a window, and runs nothing.
func (c Collection) Running(window string) bool {
	pane, open := c.Windows[window]

	return open && !pane.Dead
}

// Exited hands back the status a dead command left, and whether the window is a corpse at all.
func (c Collection) Exited(window string) (int, bool) {
	pane, open := c.Windows[window]
	if !open || !pane.Dead {
		return 0, false
	}

	return pane.Status, true
}

func (c Collection) PortUp(port int) bool {
	return c.Listening[port]
}

func (c Collection) PID(window string) int {
	if !c.Running(window) {
		return 0
	}

	return c.Windows[window].PID
}

func (c Collection) Seconds(window string) int {
	return c.Uptime[c.PID(window)]
}

// The panes read the other way round: a process knows the pid it descends from, never the window's name.
func (c Collection) Panes() map[int]string {
	panes := make(map[int]string, len(c.Windows))
	for name, pane := range c.Windows {
		if !pane.Dead {
			panes[pane.PID] = name
		}
	}

	return panes
}

// Windows lists the live panes of the session, by name.
func Windows(ctx sys.Context, options Options) map[string]int {
	return Collection{Windows: windows(ctx, options.Resolved())}.livePIDs()
}

func (c Collection) livePIDs() map[string]int {
	live := map[string]int{}
	for name, pane := range c.Windows {
		if !pane.Dead {
			live[name] = pane.PID
		}
	}

	return live
}

// Read with the fate of each pane: a command that exited leaves its pane behind, since the window keeps it, and its status says how it ended.
// tmux prints a window's panes in order, so the first line of a window id is its own pane and a split the user opened comes after.
func windows(ctx sys.Context, options Options) map[string]Pane {
	open := map[string]Pane{}

	out, err := ctx.Sys().Run(options.tmux("list-panes", "-s", "-t", sessionTarget(options), "-F", "#{window_id} #{window_name} #{pane_pid} #{?pane_dead,dead,alive} #{pane_dead_status}"))
	if err != nil {
		return open
	}

	seen := map[string]bool{}
	for _, line := range strings.Split(out.Stdout, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 4 || seen[fields[0]] {
			continue
		}
		seen[fields[0]] = true

		pid, err := strconv.Atoi(fields[2])
		if err != nil {
			continue
		}

		if first, twice := open[fields[1]]; twice {
			first.Twins = append(first.Twins, fields[0])
			open[fields[1]] = first
			continue
		}

		pane := Pane{ID: fields[0], PID: pid, Dead: fields[3] == "dead", Status: signalled}
		if pane.Dead && len(fields) > 4 {
			if status, err := strconv.Atoi(fields[4]); err == nil {
				pane.Status = status
			}
		}

		open[fields[1]] = pane
	}

	return open
}

func (p Pane) windows() []string {
	return append([]string{p.ID}, p.Twins...)
}

// The kernel's own table, the one the registry and the detection read: ss would also see the sockets of other namespaces, a Docker port among them.
func listening(ctx sys.Context) map[int]bool {
	return net.Listening(ctx)
}

func uptimes(ctx sys.Context, pids []string) map[int]int {
	seconds := map[int]int{}

	out, err := ctx.Sys().Run(sys.Command{Argv: []string{"ps", "-o", "pid=,etimes=", "-p", strings.Join(pids, ",")}})
	if err != nil {
		return seconds
	}

	for _, line := range strings.Split(out.Stdout, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}

		pid, pidErr := strconv.Atoi(fields[0])
		elapsed, elapsedErr := strconv.Atoi(fields[1])
		if pidErr == nil && elapsedErr == nil {
			seconds[pid] = elapsed
		}
	}

	return seconds
}

// Activity is when something last moved in each pane of the user's tmux, by
// the pid its shell runs under, whatever session the pane belongs to: what an
// agent's idleness is measured on, since age says nothing of it.
func Activity(ctx sys.Context, options Options) map[int]time.Time {
	options = options.Resolved()
	moved := map[int]time.Time{}

	out, err := ctx.Sys().Run(options.tmux("list-panes", "-a", "-F", "#{pane_pid} #{window_activity}"))
	if err != nil {
		return moved
	}

	for _, line := range strings.Split(out.Stdout, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}

		pid, pidErr := strconv.Atoi(fields[0])
		at, atErr := strconv.ParseInt(fields[1], 10, 64)
		if pidErr == nil && atErr == nil {
			moved[pid] = time.Unix(at, 0)
		}
	}

	return moved
}

// Alive says whether the session exists at all: gone with a boot, kept through a restart of the daemon.
func Alive(ctx sys.Context, options Options) bool {
	options = options.Resolved()

	_, err := ctx.Sys().Run(options.tmux("has-session", "-t", sessionTarget(options)))

	return err == nil
}

func EnsureSession(ctx sys.Context, options Options, dir string) error {
	if Alive(ctx, options) {
		return nil
	}

	options = options.Resolved()

	_, err := sys.Exec(ctx, options.tmux("new-session", "-d", "-s", options.Session, "-n", "scratch", "-c", dir))

	return err
}

// A Job is one window to open: the process's window name, the folder it runs from, and its command.
type Job struct {
	Window string
	Dir    string
	Cmd    string
}

// Start opens the window on the command itself, as the user's login shell runs it.
//
// The command is the pane, not a line typed into a shell: when it exits the
// pane dies and tmux keeps its corpse with the status, which is how the state
// tells a server still coming up from one that died on the spot. The option
// and the pipe travel in the same call as the window, so no exit and no output
// can slip in before them.
func Start(ctx sys.Context, options Options, job Job) error {
	options = options.Resolved()

	if err := EnsureSession(ctx, options, job.Dir); err != nil {
		return err
	}

	if pane, open := windows(ctx, options)[job.Window]; open && pane.Dead {
		if err := close(ctx, options, pane); err != nil {
			return err
		}
	}

	// The journal starts over with the run: the previous shutdown's "exited with code 130" would read as a failure, and a journal never emptied would be read whole at every snapshot.
	if _, err := file.Remove(ctx, options.LogPath(job.Window)); err != nil {
		return err
	}

	if err := mark(ctx, options, job.Window, upMarker+options.Now().UTC().Format(time.RFC3339)+" ==="); err != nil {
		return err
	}

	target := Target(options, job.Window)
	_, err := sys.Exec(ctx, options.tmux(
		"new-window", "-d", "-t", sessionTarget(options), "-n", job.Window, "-c", job.Dir,
		"-e", commandKey+"="+job.Cmd, "exec "+user.Shell+` -lc "$`+commandKey+`"`,
		";", "set-option", "-w", "-t", target, "remain-on-exit", "on",
		";", "pipe-pane", "-o", "-t", target, "cat >> "+options.LogPath(job.Window),
	))

	return err
}

// Stop interrupts what runs and closes the window; a corpse has nothing to interrupt and is only closed.
func Stop(ctx sys.Context, options Options, window string) error {
	options = options.Resolved()

	if err := mark(ctx, options, window, downMarker+options.Now().UTC().Format(time.RFC3339)+" ==="); err != nil {
		return err
	}

	pane, open := windows(ctx, options)[window]
	if !open {
		_, err := sys.Exec(ctx, options.tmux("kill-window", "-t", Target(options, window)))

		return err
	}

	if !pane.Dead {
		if _, err := sys.Exec(ctx, options.tmux("send-keys", "-t", pane.ID, "C-c")); err != nil {
			return err
		}

		if options.Grace > 0 {
			time.Sleep(options.Grace)
		}
	}

	return close(ctx, options, pane)
}

func close(ctx sys.Context, options Options, pane Pane) error {
	for _, id := range pane.windows() {
		if _, err := sys.Exec(ctx, options.tmux("kill-window", "-t", id)); err != nil {
			return err
		}
	}

	return nil
}

func Logs(ctx sys.Context, options Options, window string, lines int) ([]string, error) {
	options = options.Resolved()
	if lines <= 0 {
		lines = DefaultLines
	}

	raw, err := file.Tail(ctx, options.LogPath(window), tailBytes)
	if err != nil {
		return nil, protocol.NewError(contract.ErrorProjectNotFound, i18n.T("tmux.journal.none", window)).
			WithFix(i18n.T("tmux.journal.none.fix"))
	}

	return tail(string(raw), lines), nil
}

// What in a log says the startup has failed, read only from the last start marker on.
func Failed(ctx sys.Context, options Options, window string) bool {
	raw, err := file.Tail(ctx, options.Resolved().LogPath(window), tailBytes)
	if err != nil {
		return false
	}

	text := string(raw)
	if at := strings.LastIndex(text, upMarker); at >= 0 {
		text = text[at:]
	}

	return fatal.MatchString(text)
}

// State reads one process off the machine: its window, and whether its main port answers.
func State(ctx sys.Context, options Options, window, pkgmgr string, port int, collected Collection) contract.ProcessState {
	up := collected.PortUp(port)

	// A service row is systemd's business: down says its port does not answer, where stopped would say we stopped it.
	if pkgmgr == "service" {
		if up {
			return contract.ProcessService
		}

		return contract.ProcessDown
	}

	// The command is gone and the pane says how: a status of zero is a stop, anything else — or a signal — a failure.
	if status, exited := collected.Exited(window); exited {
		if status == 0 {
			return contract.ProcessStopped
		}

		return contract.ProcessFailed
	}

	if !collected.Running(window) {
		// The port answers with no window of ours: someone started it another way, and project.down has no grip on it.
		if up {
			return contract.ProcessExternal
		}

		return contract.ProcessStopped
	}

	if up {
		return contract.ProcessOnline
	}

	if Failed(ctx, options, window) {
		return contract.ProcessFailed
	}

	return contract.ProcessStarting
}

func mark(ctx sys.Context, options Options, window, line string) error {
	logPath := options.LogPath(window)

	if err := file.MkdirOwned(ctx, logPath[:strings.LastIndex(logPath, "/")], options.User, options.User, 0o755); err != nil {
		return err
	}

	return file.Append(ctx, logPath, []byte("\n"+line+"\n"), options.User)
}

// A tail cut mid-line starts on the first whole line after the cut.
func tail(text string, lines int) []string {
	if len(text) >= tailBytes {
		if _, whole, cut := strings.Cut(text, "\n"); cut {
			text = whole
		}
	}

	all := strings.Split(strings.TrimRight(text, "\n"), "\n")
	if len(all) == 1 && all[0] == "" {
		return []string{}
	}

	if len(all) > lines {
		all = all[len(all)-lines:]
	}

	return all
}

// The window of a process, as tmux addresses it: exact on both sides, since a
// name that merely begins the same way — a window the user opened by hand —
// would otherwise answer for it.
func Target(options Options, window string) string {
	return sessionTarget(options) + ":=" + window
}

func sessionTarget(options Options) string {
	return "=" + options.Resolved().Session
}

// The session belongs to the user whose projects run in it: tmux as root would open a server nobody's shell can attach to,
// and a server started with root's environment hands HOME=/root to every window and every shell attached later.
func (o Options) tmux(args ...string) sys.Command {
	return sys.Command{User: o.User, Argv: append([]string{"tmux"}, args...), Env: user.Environment(o.User)}
}

// Running says whether the window holds a live command: absent or dead, it runs nothing.
func Running(ctx sys.Context, options Options, window string) bool {
	return Collection{Windows: windows(ctx, options.Resolved())}.Running(window)
}

// Open says whether the window exists at all, its command alive or dead: what a stop has to close.
func Open(ctx sys.Context, options Options, window string) bool {
	_, open := windows(ctx, options.Resolved())[window]

	return open
}
