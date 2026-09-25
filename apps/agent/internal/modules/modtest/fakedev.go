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

// What a project's command does once its window opens: bind its port. Nothing else in the fake makes a port answer.
func (f *FakeSys) Serves(window string, port int) {
	f.Binds[window] = port
}

// Duplicates opens a second window under the name, as a start whose last stop failed leaves one.
func (f *FakeSys) Duplicates(window string) {
	f.Twins[window] = append(f.Twins[window], firstPanePID+len(f.Windows)+len(f.Twins)+100)
}

// Splits gives the window a second pane, the user's, which list-panes prints after the window's own.
func (f *FakeSys) Splits(window string) {
	f.Split[window] = true
}

// The command of a window exits with that status, and the pane stays as its corpse; -1 stands for a signal, which leaves no status.
func (f *FakeSys) Dies(window string, status int) {
	f.Dead[window] = status
	if port, bound := f.Binds[window]; bound {
		delete(f.Listen, port)
	}
}

// One tmux invocation carries several commands, separated by a bare ";": each runs in turn, and the first refusal ends the call.
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

// A target names a window by its id (@pid), or by its name, which tmux refuses once two windows carry it. The twin index is -1 for the window itself.
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

// Every pane of every session, its pid and when it last moved, as list-panes -a
// prints them for the idleness reader: a window a test declared under Activity
// moved then, the others at the fake's clock.
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

// What tmux prints of a pane's fate: alive, or dead with the status its command left, which a signal leaves blank.
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

// A transcript that seeds ss by hand keeps its answer: the probe reads processes there, the project state only ports.
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

// The panes opened by the fake tmux are processes too: a transcript that never spawns one still sees its window in ps.
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

// The files under a root, one path per line, as a bare find prints them.
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

// A target may be exact, with tmux's leading "=": =pupitre names the session as it is, =pupitre:=web the window as it is.
func parseTmux(args []string) (action, target, name string) {
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-t", "-s":
			// list-panes -s is a flag, new-session -s carries the session name: only a non-flag word is a value.
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

// exact strips the "=" tmux takes for an exact match off the session, and off the window behind the colon.
func exact(target string) string {
	session, window, found := strings.Cut(target, ":")
	session = strings.TrimPrefix(session, "=")
	if !found {
		return session
	}

	return session + ":" + strings.TrimPrefix(window, "=")
}
