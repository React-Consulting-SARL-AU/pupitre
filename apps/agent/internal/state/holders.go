package state

import (
	"regexp"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/net"
)

var listenerPID = regexp.MustCompile(`pid=(\d+)`)

// A gateway's backends listen on ports no registry row declares: ss names their pids, the ps tree the project window above them.
func (r *Reader) holders(table processTable, panes map[int]string) map[int]string {
	held := map[int]string{}

	out, err := r.ctx().Sys().Run(sys.Command{Argv: []string{"ss", "-ltnpH"}})
	if err != nil {
		return held
	}

	for _, line := range strings.Split(out.Stdout, "\n") {
		port, pids := listener(line)

		for _, pid := range pids {
			if window := table.window(pid, panes); projectWindow(window) {
				held[port] = window

				break
			}
		}
	}

	return held
}

// ss and ps cost a fork each, so only once one of the ports answers.
func (r *Reader) liveHolders(ports []int) map[int]string {
	listening := net.Listening(r.ctx())

	for _, port := range ports {
		if listening.Has(port) {
			return r.holders(r.processes(), r.panes())
		}
	}

	return map[int]string{}
}

func listener(line string) (int, []int) {
	fields := strings.Fields(line)
	if len(fields) < 4 {
		return 0, nil
	}

	local := fields[3]

	port, err := strconv.Atoi(local[strings.LastIndex(local, ":")+1:])
	if err != nil {
		return 0, nil
	}

	var pids []int

	for _, match := range listenerPID.FindAllStringSubmatch(line, -1) {
		if pid, err := strconv.Atoi(match[1]); err == nil {
			pids = append(pids, pid)
		}
	}

	return port, pids
}

func projectWindow(window string) bool {
	_, _, ours := registry.SplitWindow(window)

	return ours
}

// The other project window that holds this window's port; empty when it is free, its own, or held outside any project.
func elsewhere(held map[int]string, port int, window string) string {
	if holder := held[port]; holder != window {
		return holder
	}

	return ""
}

func (r *Reader) portHeld(window string, port int, holder string) error {
	project, _, _ := registry.SplitWindow(holder)

	return protocol.NewError(contract.ErrorBadRequest, i18n.T("state.port.held", window, port, holder)).
		WithFix(i18n.T("state.port.held.fix", project, window, r.freePortFrom(port)))
}

func (r *Reader) heldPorts(project registry.Project) []string {
	var ports []int

	for _, process := range project.Processes {
		ports = append(ports, process.Ports()...)
	}

	held := r.liveHolders(ports)

	var warnings []string

	for _, process := range project.Processes {
		window := project.Window(process.ID)

		for _, port := range process.Ports() {
			if holder := elsewhere(held, port, window); holder != "" {
				warnings = append(warnings, i18n.T("state.project.warning.port", port, window, holder, r.freePortFrom(port)))
			}
		}
	}

	return warnings
}

func (r *Reader) freePortFrom(port int) int {
	return r.registry().FreePort(port, net.Listening(r.ctx()))
}
