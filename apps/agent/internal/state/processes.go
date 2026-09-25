package state

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/tmux"
)

const (
	// A JetBrains backend or an agent left behind holds its memory for nobody; two hours idle is the line bootstrap.sh draws.
	SessionIdle = 120 * time.Minute

	KillGrace = 2 * time.Second

	topProcesses = 12
	maxAncestors = 40
)

// The programs that outlive whatever launched them: an agent, and a remote IDE backend.
var remoteIDE = regexp.MustCompile(`RemoteDev|remote-dev-server`)

type process struct {
	PID     int
	User    string
	CPU     float64
	RAMMB   int
	Seconds int
	Args    string
}

func (p process) program() string {
	return base(field(p.Args, 0))
}

type processTable struct {
	rows  []process
	owner map[int]int
}

// One read of the machine: the project totals, the sessions and the process list all come out of the same ps.
func (r *Reader) processes() processTable {
	table := processTable{owner: map[int]int{}}

	out, err := r.ctx().Sys().Run(sys.Command{Argv: []string{"ps", "-eo", "pid=,ppid=,user=,pcpu=,rss=,etimes=,args="}})
	if err != nil {
		return table
	}

	for _, line := range strings.Split(out.Stdout, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 7 {
			continue
		}

		pid, pidErr := strconv.Atoi(fields[0])
		ppid, ppidErr := strconv.Atoi(fields[1])
		if pidErr != nil || ppidErr != nil {
			continue
		}

		cpu, _ := strconv.ParseFloat(fields[3], 64)
		rss, _ := strconv.Atoi(fields[4])
		seconds, _ := strconv.Atoi(fields[5])

		table.rows = append(table.rows, process{
			PID: pid, User: fields[2], CPU: cpu,
			RAMMB: rss / 1024, Seconds: seconds, Args: strings.Join(fields[6:], " "),
		})
		table.owner[pid] = ppid
	}

	return table
}

func (t processTable) get(pid int) (process, bool) {
	for _, row := range t.rows {
		if row.PID == pid {
			return row, true
		}
	}

	return process{}, false
}

// The window a process belongs to is the one whose tmux pane it descends from, however deep the ancestry goes.
func (t processTable) window(pid int, panes map[int]string) string {
	for step := 0; step < maxAncestors; step++ {
		if name, owned := panes[pid]; owned {
			return name
		}

		parent, known := t.owner[pid]
		if !known || parent <= 1 {
			return ""
		}

		pid = parent
	}

	return ""
}

func (t processTable) ancestor(pid, of int) bool {
	for step := 0; step < maxAncestors; step++ {
		if pid == of {
			return true
		}

		parent, known := t.owner[of]
		if !known || parent <= 1 {
			return false
		}

		of = parent
	}

	return false
}

// The pane a process runs in, by the pid of its shell, when one of the panes measured is among its ancestors.
func (t processTable) pane(pid int, activity map[int]time.Time) (time.Time, bool) {
	for step := 0; step < maxAncestors; step++ {
		if at, measured := activity[pid]; measured {
			return at, true
		}

		parent, known := t.owner[pid]
		if !known || parent <= 1 {
			return time.Time{}, false
		}

		pid = parent
	}

	return time.Time{}, false
}

// The project a process belongs to, read off the window it descends from: a window is named <project>/<process>, a session started by hand in the scratch window belongs to no project.
func (t processTable) project(pid int, panes map[int]string) string {
	project, _, ours := registry.SplitWindow(t.window(pid, panes))
	if !ours {
		return ""
	}

	return project
}

// Memory per window, ancestry included: a dev server is a shell, a package manager and the runtime that does the work.
func (t processTable) ram(panes map[int]string) map[string]int {
	totals := map[string]int{}
	for _, row := range t.rows {
		if name := t.window(row.PID, panes); name != "" {
			totals[name] += row.RAMMB
		}
	}

	return totals
}

func (r *Reader) Sessions() []contract.Session {
	table := r.processes()

	return r.sessions(table, r.panes())
}

func (r *Reader) sessions(table processTable, panes map[int]string) []contract.Session {
	sessions := []contract.Session{}

	for _, row := range table.rows {
		kind, isSession := sessionKind(row)
		if !isSession {
			continue
		}

		sessions = append(sessions, contract.Session{
			PID:     row.PID,
			Seconds: row.Seconds,
			RAMMB:   row.RAMMB,
			Kind:    kind,
			Project: table.project(row.PID, panes),
			Command: row.Args,
		})
	}

	sort.Slice(sessions, func(i, j int) bool { return sessions[i].PID < sessions[j].PID })

	return sessions
}

func sessionKind(row process) (string, bool) {
	switch {
	case remoteIDE.MatchString(row.Args):
		return "ide", true
	case row.program() == "claude", strings.Contains(row.Args, ".claude/remote"), strings.Contains(row.Args, "ccd-cli"):
		return "claude", true
	case row.program() == "codex":
		return "codex", true
	case row.program() == "cursor-agent", strings.Contains(row.Args, "cursor-agent/versions/"):
		return "cursor", true
	case row.program() == "opencode":
		return "opencode", true
	case row.program() == "gemini", strings.Contains(row.Args, "gemini-cli"):
		return "gemini", true
	case row.program() == "copilot":
		return "copilot", true
	case row.program() == "hermes":
		return "hermes", true
	}

	return "", false
}

// A session is cleaned on what it has been doing, not on how long it has
// lived: an agent someone typed into a minute ago has been running for
// hours too. What runs in a pane is measured on that pane; what runs outside
// any has only its age to be judged on.
func (r *Reader) CleanSessions() int {
	table := r.processes()
	panes := r.panes()
	activity := tmux.Activity(r.ctx(), r.options.Tmux)
	now := r.options.Now()
	killed := 0

	for _, session := range r.sessions(table, panes) {
		quiet := time.Duration(session.Seconds) * time.Second
		if at, measured := table.pane(session.PID, activity); measured {
			quiet = now.Sub(at)
		}

		if quiet < SessionIdle {
			continue
		}

		row, _ := table.get(session.PID)
		if err := r.signal(session.PID, row.User, syscall.SIGTERM); err == nil {
			killed++
		}
	}

	return killed
}

func (r *Reader) Processes() []contract.Process {
	table := r.processes()
	panes := r.panes()

	rows := append([]process(nil), table.rows...)
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].CPU > rows[j].CPU })
	if len(rows) > topProcesses {
		rows = rows[:topProcesses]
	}

	processes := make([]contract.Process, 0, len(rows))
	for _, row := range rows {
		processes = append(processes, contract.Process{
			PID:     row.PID,
			CPU:     row.CPU,
			RAMMB:   row.RAMMB,
			Command: row.program(),
			Project: table.project(row.PID, panes),
		})
	}

	return processes
}

// What carries the session: killing one of these cuts the channel the order arrived through, and project.down is the way to stop a project.
var carriers = map[string]bool{
	"tmux": true, "tmux-server": true, "sshd": true, "systemd": true,
	"init": true, "zsh": true, "bash": true, "sh": true, "login": true, "pupitred": true,
}

func (r *Reader) Kill(pid int, force bool) error {
	if pid <= 1 {
		return badPID(strconv.Itoa(pid), i18n.T("state.pid.refused.fix"))
	}

	table := r.processes()

	target, running := table.get(pid)
	if !running {
		return badPID(strconv.Itoa(pid), i18n.T("state.pid.gone.fix"))
	}

	if owner := r.options.Tmux.Resolved().User; target.User != owner {
		return badPID(i18n.T("state.pid.foreign", strconv.Itoa(pid), target.User), i18n.T("state.pid.foreign.fix", owner))
	}

	if carriers[target.program()] {
		return badPID(i18n.T("state.pid.carrier", target.program()), i18n.T("state.pid.carrier.fix"))
	}

	if table.ancestor(pid, r.self()) {
		return badPID(i18n.T("state.pid.ancestor", strconv.Itoa(pid)), i18n.T("state.pid.ancestor.fix"))
	}

	if err := r.signal(pid, target.User, syscall.SIGTERM); err != nil {
		return protocol.NewError(contract.ErrorInternal, i18n.T("state.process.kill.failed", strconv.Itoa(pid))).
			WithFix(i18n.T("state.process.kill.failed.fix"))
	}

	if force {
		r.sleep(KillGrace)
		if alive := r.ctx().Sys().Signal(pid, target.User, 0); alive == nil {
			return r.signal(pid, target.User, syscall.SIGKILL)
		}
	}

	return nil
}

// The owner seen in the table goes with every signal: a pid recycled since by another account is not the process that was chosen.
func (r *Reader) signal(pid int, owner string, sig syscall.Signal) error {
	r.ctx().Logf("kill -%d %d", sig, pid)

	return r.ctx().Sys().Signal(pid, owner, sig)
}

func (r *Reader) panes() map[int]string {
	panes := map[int]string{}
	for name, pid := range tmux.Windows(r.ctx(), r.options.Tmux) {
		panes[pid] = name
	}

	return panes
}

func badPID(message, fix string) error {
	return protocol.NewError(contract.ErrorBadRequest, i18n.T("state.pid.refused", message)).WithFix(fix)
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
