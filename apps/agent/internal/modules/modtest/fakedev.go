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

	var out strings.Builder
	for _, pid := range strings.Split(args[len(args)-1], ",") {
		parsed, err := strconv.Atoi(pid)
		if err != nil {
			continue
		}

		if seconds, alive := f.Uptimes[parsed]; alive {
			fmt.Fprintf(&out, "%d %d\n", parsed, seconds)
		}
	}

	return sys.Output{Stdout: out.String()}, nil
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
