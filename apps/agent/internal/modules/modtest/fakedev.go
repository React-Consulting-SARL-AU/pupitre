package modtest

import (
	"fmt"
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

func (f *FakeSys) tmux(args []string) (sys.Output, error) {
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
		window := windowName(target)
		if _, open := f.Windows[window]; !open {
			return f.fail("tmux", "can't find window: "+window)
		}
		f.closeWindow(window)
	case "list-panes", "list-windows":
		if !f.Sessions[target] {
			return f.fail("tmux", "can't find session: "+target)
		}

		return sys.Output{Stdout: f.panes(action == "list-panes")}, nil
	case "send-keys", "pipe-pane":
		f.mutate("tmux " + action + " " + target)
	default:
		return f.fail("tmux", "unknown command: "+action)
	}

	return sys.Output{}, nil
}

func (f *FakeSys) openWindow(name string) {
	f.Windows[name] = firstPanePID + len(f.Windows)
	f.Uptimes[f.Windows[name]] = 42
	if port, bound := f.Binds[name]; bound {
		f.Listen[port] = true
	}

	f.mutate("tmux new-window " + name)
}

func (f *FakeSys) closeWindow(name string) {
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
		if withPID {
			fmt.Fprintf(&out, "%s %d\n", name, f.Windows[name])
			continue
		}

		fmt.Fprintf(&out, "%s\n", name)
	}

	return out.String()
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

// Only the shape shot --list uses: the files under a root, newest time first, one line each.
func (f *FakeSys) find(args []string) (sys.Output, error) {
	if seeded, ok := f.Replies["find"]; ok {
		return sys.Output{Stdout: seeded}, nil
	}

	root := args[0]

	paths := make([]string, 0, len(f.Files))
	for path := range f.Files {
		if strings.HasPrefix(path, strings.TrimSuffix(root, "/")+"/") {
			paths = append(paths, path)
		}
	}
	sort.Strings(paths)

	var out strings.Builder
	for _, path := range paths {
		when := f.Times[path]
		if when.IsZero() {
			when = f.Now
		}

		fmt.Fprintf(&out, "%d\t%d\t%s\n", when.Unix(), len(f.Files[path]), path)
	}

	return sys.Output{Stdout: out.String()}, nil
}

func (f *FakeSys) kill(args []string) (sys.Output, error) {
	signal, pid := "-TERM", 0
	for _, arg := range args {
		if strings.HasPrefix(arg, "-") {
			signal = arg
			continue
		}

		pid = atoi(arg)
	}

	if _, running := f.Procs[pid]; !running {
		return f.fail("kill", "kill: ("+strconv.Itoa(pid)+") - No such process")
	}

	if signal == "-0" {
		return sys.Output{}, nil
	}

	f.Signals = append(f.Signals, signal+" "+strconv.Itoa(pid))
	f.mutate("kill " + signal + " " + strconv.Itoa(pid))

	// A process that ignores SIGTERM is the whole point of force: it must still be there when the grace period is over.
	if signal == "-TERM" && f.Stubborn[pid] {
		return sys.Output{}, nil
	}

	delete(f.Procs, pid)

	return sys.Output{}, nil
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

func (f *FakeSys) tee(args []string, stdin []byte) (sys.Output, error) {
	path := args[len(args)-1]
	f.Files[path] = append(f.Files[path], stdin...)
	f.mutate("append " + path)

	return sys.Output{Stdout: string(stdin)}, nil
}

func parseTmux(args []string) (action, target, name string) {
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-t", "-s":
			// list-panes -s is a flag, new-session -s carries the session name: only a non-flag word is a value.
			if i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
				target = args[i+1]
				i++
			}
		case "-n":
			if i+1 < len(args) {
				name = args[i+1]
				i++
			}
		case "-c", "-F":
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
		return window
	}

	return target
}
