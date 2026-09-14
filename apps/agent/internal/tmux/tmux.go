package tmux

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	DefaultSession = "pupitre"
	DefaultUser    = "dev"
	DefaultLines   = 120

	upMarker   = "=== pupitre up "
	downMarker = "=== pupitre down "
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

// One read of the machine for every window: tmux, ss and ps once each, not once per process.
type Collection struct {
	Windows   map[string]int
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
	for _, pid := range collected.Windows {
		pids = append(pids, strconv.Itoa(pid))
	}

	if len(pids) > 0 {
		collected.Uptime = uptimes(ctx, pids)
	}

	return collected
}

func (c Collection) Running(window string) bool {
	_, open := c.Windows[window]

	return open
}

func (c Collection) PortUp(port int) bool {
	return c.Listening[port]
}

func (c Collection) PID(window string) int {
	return c.Windows[window]
}

func (c Collection) Seconds(window string) int {
	return c.Uptime[c.Windows[window]]
}

// The panes read the other way round: a process knows the pid it descends from, never the window's name.
func (c Collection) Panes() map[int]string {
	panes := make(map[int]string, len(c.Windows))
	for name, pid := range c.Windows {
		panes[pid] = name
	}

	return panes
}

func Windows(ctx sys.Context, options Options) map[string]int {
	return windows(ctx, options.Resolved())
}

func windows(ctx sys.Context, options Options) map[string]int {
	open := map[string]int{}

	out, err := ctx.Sys().Run(options.tmux("list-panes", "-s", "-t", options.Session, "-F", "#{window_name} #{pane_pid}"))
	if err != nil {
		return open
	}

	for _, line := range strings.Split(out.Stdout, "\n") {
		name, pid, ok := strings.Cut(strings.TrimSpace(line), " ")
		if !ok {
			continue
		}

		if parsed, err := strconv.Atoi(pid); err == nil {
			open[name] = parsed
		}
	}

	return open
}

// Without -p: asking ss for the socket→process mapping makes it walk /proc and doubles its cost, and the state only needs the port.
func listening(ctx sys.Context) map[int]bool {
	ports := map[int]bool{}

	out, err := ctx.Sys().Run(sys.Command{Argv: []string{"ss", "-lntH"}})
	if err != nil {
		return ports
	}

	for _, line := range strings.Split(out.Stdout, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}

		address := fields[3]
		if port, err := strconv.Atoi(address[strings.LastIndex(address, ":")+1:]); err == nil {
			ports[port] = true
		}
	}

	return ports
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

func EnsureSession(ctx sys.Context, options Options, dir string) error {
	options = options.Resolved()

	if _, err := ctx.Sys().Run(options.tmux("has-session", "-t", options.Session)); err == nil {
		return nil
	}

	_, err := sys.Exec(ctx, options.tmux("new-session", "-d", "-s", options.Session, "-n", "scratch", "-c", dir))

	return err
}

// A Job is one window to open: the process's window name, the folder it runs from, and its command.
type Job struct {
	Window string
	Dir    string
	Cmd    string
}

func Start(ctx sys.Context, options Options, job Job) error {
	options = options.Resolved()

	if err := EnsureSession(ctx, options, job.Dir); err != nil {
		return err
	}

	if _, err := sys.Exec(ctx, options.tmux("new-window", "-d", "-t", options.Session, "-n", job.Window, "-c", job.Dir)); err != nil {
		return err
	}

	logPath := options.LogPath(job.Window)
	if _, err := sys.Exec(ctx, options.tmux("pipe-pane", "-o", "-t", Target(options, job.Window), "cat >> "+logPath)); err != nil {
		return err
	}

	// The marker separates this start from the previous shutdown, whose last line reads "exited with code 130" — read as a failure otherwise.
	if err := mark(ctx, options, job.Window, upMarker+options.Now().UTC().Format(time.RFC3339)+" ==="); err != nil {
		return err
	}

	_, err := sys.Exec(ctx, options.tmux("send-keys", "-t", Target(options, job.Window), job.Cmd, "C-m"))

	return err
}

func Stop(ctx sys.Context, options Options, window string) error {
	options = options.Resolved()

	if err := mark(ctx, options, window, downMarker+options.Now().UTC().Format(time.RFC3339)+" ==="); err != nil {
		return err
	}

	if _, err := sys.Exec(ctx, options.tmux("send-keys", "-t", Target(options, window), "C-c")); err != nil {
		return err
	}

	if options.Grace > 0 {
		time.Sleep(options.Grace)
	}

	_, err := sys.Exec(ctx, options.tmux("kill-window", "-t", Target(options, window)))

	return err
}

func Logs(ctx sys.Context, options Options, window string, lines int) ([]string, error) {
	options = options.Resolved()
	if lines <= 0 {
		lines = DefaultLines
	}

	raw, err := file.Read(ctx, options.LogPath(window))
	if err != nil {
		return nil, protocol.NewError(contract.ErrorProjectNotFound, i18n.T("tmux.journal.none", window)).
			WithFix(i18n.T("tmux.journal.none.fix"))
	}

	return tail(string(raw), lines), nil
}

// What in a log says the startup has failed, read only from the last start marker on.
func Failed(ctx sys.Context, options Options, window string) bool {
	raw, err := file.Read(ctx, options.Resolved().LogPath(window))
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

func tail(text string, lines int) []string {
	all := strings.Split(strings.TrimRight(text, "\n"), "\n")
	if len(all) == 1 && all[0] == "" {
		return []string{}
	}

	if len(all) > lines {
		all = all[len(all)-lines:]
	}

	return all
}

// The window of a process, as tmux addresses it.
func Target(options Options, window string) string {
	return fmt.Sprintf("%s:%s", options.Resolved().Session, window)
}

// The session belongs to the user whose projects run in it: tmux as root would open a server nobody's shell can attach to,
// and a server started with root's environment hands HOME=/root to every window and every shell attached later.
func (o Options) tmux(args ...string) sys.Command {
	return sys.Command{User: o.User, Argv: append([]string{"tmux"}, args...), Env: user.Environment(o.User)}
}

func Running(ctx sys.Context, options Options, window string) bool {
	options = options.Resolved()

	out, err := ctx.Sys().Run(options.tmux("list-windows", "-t", options.Session, "-F", "#{window_name}"))
	if err != nil {
		return false
	}

	for _, line := range strings.Split(out.Stdout, "\n") {
		if strings.TrimSpace(line) == window {
			return true
		}
	}

	return false
}
