package modtest

import (
	"fmt"
	"slices"
	"sort"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/sys"
)

const firstPanePID = 4000

// Nothing else in the fake makes a port answer.
func (f *FakeSys) Serves(window string, port int) {
	f.Binds[window] = port
}

// A second window under the name, as a start whose last stop failed leaves one.
func (f *FakeSys) Duplicates(window string) {
	f.Twins[window] = append(f.Twins[window], firstPanePID+len(f.Windows)+len(f.Twins)+100)
}

func (f *FakeSys) Splits(window string) {
	f.Split[window] = true
}

// The pane stays as a corpse; a status of -1 stands for a signal, which leaves no status.
func (f *FakeSys) Dies(window string, status int) {
	f.Dead[window] = status

	if port, bound := f.Binds[window]; bound {
		delete(f.Listen, port)
	}
}

// Commands separated by a bare ";" run in turn, and the first refusal ends the call.
func (f *FakeSys) tmux(args []string) (sys.Output, error) {
	var out sys.Output

	for _, command := range splitTmux(args) {
		answer, err := f.tmuxOne(command)
		if err != nil {
			return answer, err
		}

		out.Stdout += answer.Stdout
	}

	return out, nil
}

func splitTmux(args []string) [][]string {
	var commands [][]string
	var current []string

	for _, arg := range args {
		if arg == ";" {
			commands = append(commands, current)
			current = nil

			continue
		}

		current = append(current, arg)
	}

	return append(commands, current)
}

func (f *FakeSys) tmuxOne(args []string) (sys.Output, error) {
	action, target, name := parseTmux(args)

	switch action {
	case "has-session":
		if !f.Sessions[target] {
			return f.fail("tmux", "can't find session: "+target)
		}
	case "new-session":
		f.Sessions[target] = true
		f.mutate("tmux new-session " + target)
	case "new-window":
		if !f.Sessions[target] {
			return f.fail("tmux", "can't find session: "+target)
		}

		f.openWindow(name)
	case "kill-window":
		window, twin, err := f.window(target)
		if err != nil {
			return f.fail("tmux", err.Error())
		}

		if twin >= 0 {
			f.Twins[window] = slices.Delete(f.Twins[window], twin, twin+1)
			f.mutate("tmux kill-window " + target)

			break
		}

		f.closeWindow(window)
	case "list-panes", "list-windows":
		if slices.Contains(args, "-a") {
			return sys.Output{Stdout: f.activity()}, nil
		}

		if !f.Sessions[target] {
			return f.fail("tmux", "can't find session: "+target)
		}

		return sys.Output{Stdout: f.panes(action == "list-panes")}, nil
	case "send-keys", "pipe-pane", "set-option":
		if _, _, err := f.window(target); err != nil {
			return f.fail("tmux", err.Error())
		}

		f.mutate("tmux " + action + " " + target)
	default:
		return f.fail("tmux", "unknown command: "+action)
	}

	return sys.Output{}, nil
}

func (f *FakeSys) openWindow(name string) {
	delete(f.Dead, name)
	f.Windows[name] = firstPanePID + len(f.Windows)
	f.Uptimes[f.Windows[name]] = 42

	if port, bound := f.Binds[name]; bound {
		f.Listen[port] = true
	}

	f.mutate("tmux new-window " + name)
}

// tmux refuses a name two windows carry, never an @pid id; the twin index is -1 for the window itself.
func (f *FakeSys) window(target string) (string, int, error) {
	if id, found := strings.CutPrefix(target, "@"); found {
		pid, _ := strconv.Atoi(id)
		for name, own := range f.Windows {
			if own == pid {
				return name, -1, nil
			}
		}

		for name, twins := range f.Twins {
			if at := slices.Index(twins, pid); at >= 0 {
				return name, at, nil
			}
		}

		return "", -1, fmt.Errorf("can't find window: %s", target)
	}

	name := windowName(target)
	if _, open := f.Windows[name]; !open || len(f.Twins[name]) > 0 {
		return "", -1, fmt.Errorf("can't find window: %s", name)
	}

	return name, -1, nil
}

func (f *FakeSys) closeWindow(name string) {
	delete(f.Dead, name)
	delete(f.Split, name)
	delete(f.Uptimes, f.Windows[name])
	delete(f.Windows, name)

	if port, bound := f.Binds[name]; bound {
		delete(f.Listen, port)
	}

	f.mutate("tmux kill-window " + name)
}

func (f *FakeSys) panes(withPID bool) string {
	names := make([]string, 0, len(f.Windows))
	for name := range f.Windows {
		names = append(names, name)
	}

	sort.Strings(names)

	var out strings.Builder

	for _, name := range names {
		if !withPID {
			fmt.Fprintf(&out, "%s\n", name)

			continue
		}

		fmt.Fprintf(&out, "@%d %s %d %s\n", f.Windows[name], name, f.Windows[name], f.liveness(name))

		if f.Split[name] {
			fmt.Fprintf(&out, "@%d %s %d alive\n", f.Windows[name], name, f.Windows[name]+1)
		}

		for _, twin := range f.Twins[name] {
			fmt.Fprintf(&out, "@%d %s %d alive\n", twin, name, twin)
		}
	}

	return out.String()
}

func (f *FakeSys) activity() string {
	names := make([]string, 0, len(f.Windows))
	for name := range f.Windows {
		names = append(names, name)
	}

	sort.Strings(names)

	var out strings.Builder

	for _, name := range names {
		moved := f.Now
		if at, declared := f.Activity[name]; declared {
			moved = at
		}

		fmt.Fprintf(&out, "%d %d\n", f.Windows[name], moved.Unix())
	}

	return out.String()
}

// A pane killed by a signal prints "dead" with no status.
func (f *FakeSys) liveness(window string) string {
	status, dead := f.Dead[window]

	switch {
	case !dead:
		return "alive"
	case status < 0:
		return "dead"
	}

	return "dead " + strconv.Itoa(status)
}

// A seeded answer wins: the probe reads processes there, the project state only ports.
func (f *FakeSys) ss() (sys.Output, error) {
	if seeded, ok := f.Replies["ss"]; ok {
		return sys.Output{Stdout: seeded}, nil
	}

	ports := make([]int, 0, len(f.Listen))
	for port, listening := range f.Listen {
		if listening {
			ports = append(ports, port)
		}
	}

	sort.Ints(ports)

	var out strings.Builder

	for _, port := range ports {
		fmt.Fprintf(&out, "LISTEN 0      511          127.0.0.1:%d          0.0.0.0:*\n", port)
	}

	return sys.Output{Stdout: out.String()}, nil
}

func (f *FakeSys) ps(args []string) (sys.Output, error) {
	if seeded, ok := f.Replies["ps"]; ok {
		return sys.Output{Stdout: seeded}, nil
	}

	columns, wanted := parsePS(args)

	var out strings.Builder

	for _, proc := range f.processes() {
		if wanted != nil && !wanted[proc.PID] {
			continue
		}

		fmt.Fprintln(&out, strings.Join(render(proc, columns), " "))
	}

	return sys.Output{Stdout: out.String()}, nil
}

// Fake tmux panes are processes too, so a transcript that never spawns one still sees its window in ps.
func (f *FakeSys) processes() []Proc {
	rows := make([]Proc, 0, len(f.Procs)+len(f.Uptimes))
	for _, proc := range f.Procs {
		rows = append(rows, proc)
	}

	for pid, seconds := range f.Uptimes {
		if _, declared := f.Procs[pid]; declared {
			continue
		}

		rows = append(rows, Proc{PID: pid, PPID: 1, Etimes: seconds, User: "dev", Comm: "zsh", Args: "/bin/zsh"})
	}

	sort.Slice(rows, func(i, j int) bool { return rows[i].PID < rows[j].PID })

	return rows
}

func parsePS(args []string) (columns []string, wanted map[int]bool) {
	for i := 0; i < len(args); i++ {
		switch {
		case args[i] == "-p" && i+1 < len(args):
			wanted = map[int]bool{}
			for _, pid := range strings.Split(args[i+1], ",") {
				wanted[atoi(pid)] = true
			}

			i++
		case strings.HasSuffix(args[i], "o") && strings.HasPrefix(args[i], "-") && i+1 < len(args):
			for _, column := range strings.Split(args[i+1], ",") {
				if name := strings.TrimSuffix(column, "="); name != "" {
					columns = append(columns, name)
				}
			}

			i++
		}
	}

	return columns, wanted
}

func render(proc Proc, columns []string) []string {
	values := make([]string, 0, len(columns))
	for _, column := range columns {
		switch column {
		case "pid":
			values = append(values, strconv.Itoa(proc.PID))
		case "ppid":
			values = append(values, strconv.Itoa(proc.PPID))
		case "rss":
			values = append(values, strconv.Itoa(proc.RSS))
		case "etimes":
			values = append(values, strconv.Itoa(proc.Etimes))
		case "pcpu":
			values = append(values, strconv.FormatFloat(proc.CPU, 'f', 1, 64))
		case "user":
			values = append(values, proc.User)
		case "comm":
			values = append(values, proc.Comm)
		case "args":
			values = append(values, proc.Args)
		}
	}

	return values
}

func (f *FakeSys) find(args []string) (sys.Output, error) {
	if seeded, ok := f.Replies["find"]; ok {
		return sys.Output{Stdout: seeded}, nil
	}

	root := strings.TrimSuffix(args[0], "/") + "/"

	paths := make([]string, 0, len(f.Files))
	for path := range f.Files {
		if strings.HasPrefix(path, root) {
			paths = append(paths, path)
		}
	}

	sort.Strings(paths)

	ending := "\n"
	if slices.Contains(args, "-print0") {
		ending = "\x00"
	}

	var out strings.Builder

	for _, path := range paths {
		out.WriteString(path + ending)
	}

	return sys.Output{Stdout: out.String()}, nil
}

func base(path string) string {
	if at := strings.LastIndex(path, "/"); at >= 0 {
		return path[at+1:]
	}

	return path
}

func field(line string, index int) string {
	fields := strings.Fields(line)
	if index >= len(fields) {
		return ""
	}

	return fields[index]
}

func parseTmux(args []string) (action, target, name string) {
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-t", "-s":
			// list-panes -s is a flag but new-session -s takes the session name: only a non-flag word is a value.
			if i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
				target = exact(args[i+1])
				i++
			}
		case "-n":
			if i+1 < len(args) {
				name = args[i+1]
				i++
			}
		case "-c", "-F", "-e":
			i++
		default:
			if !strings.HasPrefix(args[i], "-") && action == "" {
				action = args[i]
			}
		}
	}

	return action, target, name
}

func windowName(target string) string {
	if _, window, ok := strings.Cut(target, ":"); ok {
		return strings.TrimPrefix(window, "=")
	}

	return target
}

// tmux's exact-match "=" may prefix both the session and the window: =pupitre:=web.
func exact(target string) string {
	session, window, found := strings.Cut(target, ":")
	session = strings.TrimPrefix(session, "=")

	if !found {
		return session
	}

	return session + ":" + strings.TrimPrefix(window, "=")
}
