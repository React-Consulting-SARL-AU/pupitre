package state

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/tmux"
)

const (
	// A JetBrains backend or an agent left behind holds its memory for nobody; two hours idle is the line bootstrap.sh draws.
	SessionAge = 120 * time.Minute

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

// The project a process belongs to is the one whose tmux pane it descends from, however deep the ancestry goes.
func (t processTable) project(pid int, panes map[int]string) string {
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

// Memory per project, ancestry included: a dev server is a shell, a package manager and the runtime that does the work.
func (t processTable) ram(panes map[int]string) map[string]int {
	totals := map[string]int{}
	for _, row := range t.rows {
		if name := t.project(row.PID, panes); name != "" {
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

// A remote IDE backend is reported as "shell": the contract knows the three agent kinds and a catch-all, and no "ide".
func sessionKind(row process) (string, bool) {
	switch {
	case remoteIDE.MatchString(row.Args):
		return "shell", true
	case row.program() == "claude", strings.Contains(row.Args, ".claude/remote"), strings.Contains(row.Args, "ccd-cli"):
		return "claude", true
	case row.program() == "codex":
		return "codex", true
	case row.program() == "hermes":
		return "hermes", true
	}

	return "", false
}

func (r *Reader) CleanSessions() int {
	table := r.processes()
	panes := r.panes()
	killed := 0

	for _, session := range r.sessions(table, panes) {
		if time.Duration(session.Seconds)*time.Second < SessionAge {
			continue
		}

		if err := r.signal(session.PID, "-TERM"); err == nil {
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
		return badPID(strconv.Itoa(pid), "Donne le pid d'une ligne de processes.list.")
	}

	table := r.processes()

	target, running := table.get(pid)
	if !running {
		return badPID(strconv.Itoa(pid), "Rafraîchis la liste : ce processus n'existe plus.")
	}

	if owner := r.options.Tmux.Resolved().User; target.User != owner {
		return badPID(strconv.Itoa(pid)+" appartient à "+target.User, "Seuls les processus de "+owner+" peuvent être arrêtés depuis Pupitre.")
	}

	if carriers[target.program()] {
		return badPID(target.program()+" porte la session", "Arrête le projet avec project.down, ou ferme le terminal.")
	}

	if table.ancestor(pid, r.self()) {
		return badPID(strconv.Itoa(pid)+" est un parent de l'agent", "L'arrêter couperait le canal par lequel l'ordre est arrivé.")
	}

	if err := r.signal(pid, "-TERM"); err != nil {
		return protocol.NewError(contract.ErrorInternal, "impossible d'arrêter "+strconv.Itoa(pid)).
			WithFix("Regarde s'il s'est terminé seul avec processes.list.")
	}

	if force {
		r.sleep(KillGrace)
		if _, alive := r.ctx().Sys().Run(sys.Command{Argv: []string{"kill", "-0", strconv.Itoa(pid)}}); alive == nil {
			return r.signal(pid, "-KILL")
		}
	}

	return nil
}

func (r *Reader) signal(pid int, name string) error {
	_, err := sys.Exec(r.ctx(), sys.Command{Argv: []string{"kill", name, strconv.Itoa(pid)}})

	return err
}

func (r *Reader) panes() map[int]string {
	panes := map[int]string{}
	for name, pid := range tmux.Windows(r.ctx(), r.options.Tmux) {
		panes[pid] = name
	}

	return panes
}

func badPID(message, fix string) error {
	return protocol.NewError(contract.ErrorBadRequest, "pid refusé : "+message).WithFix(fix)
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
