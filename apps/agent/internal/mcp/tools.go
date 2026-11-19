package mcp

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
)

const (
	// Under Codex's own 60-second limit on a tool call, so a slow start still answers.
	DefaultWait = 45
	MaxWait     = 300

	DefaultLines = 200
	MaxLines     = 2000

	pollEvery  = time.Second
	failedTail = 40

	allProjects = "all"

	// The instructions ride in every session's context: past this, the model asks project_list.
	instructedProjects = 30
)

// Read by the model like the tools' descriptions: one language for the whole contract.
const Instructions = "Pupitre drives this server's projects and services. Start, stop and restart a dev server with these tools, " +
	"never by hand: a second process would take its port. Read its logs with project_logs. To look at a page, drive the playwright " +
	"MCP server's browser on the project's local address. Read and change the server's databases with db_query, never by asking " +
	"the owner for a password or for sudo."

type Toolbox struct {
	Agent devcli.Caller
	Sleep func(time.Duration)
	Now   func() time.Time
}

func (t Toolbox) Tools() []Tool {
	return []Tool{
		t.status(),
		t.projectList(),
		t.projectAction("project_start", "Start a project", "project.up",
			"Start a project's dev processes in Pupitre's tmux session, then wait until each one is online or failed. A failed process comes back with the end of its log. Never start a dev server by hand: it doubles the process and holds its port."),
		t.projectAction("project_restart", "Restart a project", "project.restart",
			"Restart a project's dev processes with the environment Pupitre gives them now, then wait until each one is online or failed. A failed process comes back with the end of its log."),
		t.projectStop(),
		t.projectLogs(),
		t.projectPull(),
		t.projectGitStatus(),
		t.serviceAction("service_start", "Start a service", "service.start", "Start one of the server's services (a database, Mailpit, …) by its id, as status lists it."),
		t.serviceAction("service_stop", "Stop a service", "service.stop", "Stop one of the server's services by its id, as status lists it."),
		t.serviceAction("service_restart", "Restart a service", "service.restart", "Restart one of the server's services by its id, as status lists it."),
		t.serviceLogs(),
		t.dbQuery(),
		t.doctor(),
	}
}

// Read once per session: a model working in a clone on another computer learns that its code runs here.
func (t Toolbox) Instructions() string {
	answer, err := t.call("project.list", nil)
	if err != nil {
		return Instructions
	}

	listed, err := as[struct {
		Projects []contract.Project `json:"projects"`
	}](answer)
	if err != nil || len(listed.Projects) == 0 {
		return Instructions
	}

	var text strings.Builder

	text.WriteString(Instructions)
	text.WriteString("\n\nThe projects on this server. When the repository you work in is one of these, possibly cloned on another computer, " +
		"its dev servers run here: push your commits, then project_pull fetches them and restarts what was running. " +
		"A public address behind Pupitre's access gate refuses a client that does not send the device's Pupitre-Key header, a mobile app among them.\n")

	for _, project := range listed.Projects[:min(len(listed.Projects), instructedProjects)] {
		fmt.Fprintf(&text, "- %s, in %s", project.Name, project.Path)

		if project.Repo != "" {
			fmt.Fprintf(&text, ", from %s", project.Repo)
		}

		if project.Branch != "" {
			fmt.Fprintf(&text, " (branch %s)", project.Branch)
		}

		text.WriteString("\n")

		for _, process := range project.Processes {
			fmt.Fprintf(&text, "  - %s: %s:%d", process.ID, process.Host, process.Port)

			if process.URL != "" {
				fmt.Fprintf(&text, ", %s, %s", process.URL, exposure(project, process))
			}

			text.WriteString("\n")
		}
	}

	if len(listed.Projects) > instructedProjects {
		fmt.Fprintf(&text, "- and %d more: project_list names them all.\n", len(listed.Projects)-instructedProjects)
	}

	return strings.TrimRight(text.String(), "\n")
}

func exposure(project contract.Project, process contract.ProjectProcess) string {
	protected := project.Protected
	if process.Protected != nil {
		protected = *process.Protected
	}

	if protected {
		return "behind Pupitre's access gate"
	}

	return "public"
}

func (t Toolbox) status() Tool {
	return Tool{
		Name:        "status",
		Title:       "Server status",
		Description: "The machine, its services and its projects with the state of each process (online, starting, failed, stopped), its port and its address.",
		InputSchema: object(nil),
		Annotations: Annotations{ReadOnly: true, Idempotent: true},
		Run: func(raw json.RawMessage) (Result, error) {
			if err := decode(raw, &struct{}{}); err != nil {
				return Result{}, err
			}

			return t.relay("status", nil)
		},
	}
}

func (t Toolbox) projectList() Tool {
	return Tool{
		Name:        "project_list",
		Title:       "List projects",
		Description: "Every project registered in Pupitre, its folder, its processes with their command, host, port, the span of ports each reserves, public routes and state.",
		InputSchema: object(nil),
		Annotations: Annotations{ReadOnly: true, Idempotent: true},
		Run: func(raw json.RawMessage) (Result, error) {
			if err := decode(raw, &struct{}{}); err != nil {
				return Result{}, err
			}

			return t.relay("project.list", nil)
		},
	}
}

type target struct {
	Project string `json:"project"`
	Process string `json:"process"`
}

func (a target) params() map[string]any {
	params := map[string]any{"name": a.Project}
	if a.Process != "" {
		params["process"] = a.Process
	}

	return params
}

func (t Toolbox) projectAction(name, title, cmd, description string) Tool {
	return Tool{
		Name:        name,
		Title:       title,
		Description: description,
		InputSchema: object(map[string]any{
			"project":      projectProperty,
			"process":      processProperty,
			"wait_seconds": integer(fmt.Sprintf("How long to wait for the processes to settle, 0 to return at once. Default %d, at most %d.", DefaultWait, MaxWait), 0, MaxWait),
		}, "project"),
		Annotations: Annotations{Idempotent: cmd == "project.up"},
		Run: func(raw json.RawMessage) (Result, error) {
			var asked struct {
				target
				Wait *int `json:"wait_seconds"`
			}

			if err := decode(raw, &asked); err != nil {
				return Result{}, err
			}

			answer, err := t.call(cmd, asked.params())
			if err != nil {
				return Result{}, err
			}

			if asked.Project == allProjects {
				return encoded(answer)
			}

			outcome, err := t.settled(asked.target, waitOf(asked.Wait))
			if err != nil {
				return Result{}, err
			}

			return encoded(outcome)
		},
	}
}

func (t Toolbox) projectStop() Tool {
	return Tool{
		Name:        "project_stop",
		Title:       "Stop a project",
		Description: "Stop a project's dev processes, or only the one named.",
		InputSchema: object(map[string]any{"project": projectProperty, "process": processProperty}, "project"),
		Annotations: Annotations{Idempotent: true},
		Run: func(raw json.RawMessage) (Result, error) {
			var asked target
			if err := decode(raw, &asked); err != nil {
				return Result{}, err
			}

			return t.relay("project.down", asked.params())
		},
	}
}

func (t Toolbox) projectLogs() Tool {
	return Tool{
		Name:        "project_logs",
		Title:       "Read a project's logs",
		Description: "The last lines a project's dev processes wrote, every process of the project unless one is named. Each start begins with a '=== pupitre up <time> ===' line.",
		InputSchema: object(map[string]any{
			"project": projectProperty,
			"process": processProperty,
			"lines":   integer(fmt.Sprintf("How many lines per process. Default %d, at most %d.", DefaultLines, MaxLines), 1, MaxLines),
		}, "project"),
		Annotations: Annotations{ReadOnly: true, Idempotent: true},
		Run: func(raw json.RawMessage) (Result, error) {
			var asked struct {
				target
				Lines int `json:"lines"`
			}

			if err := decode(raw, &asked); err != nil {
				return Result{}, err
			}

			project, err := t.project(asked.Project)
			if err != nil {
				return Result{}, err
			}

			processes, err := chosen(project, asked.Process)
			if err != nil {
				return Result{}, err
			}

			lines := DefaultLines
			if asked.Lines > 0 {
				lines = min(asked.Lines, MaxLines)
			}

			var text strings.Builder

			for _, process := range processes {
				fmt.Fprintf(&text, "── %s/%s · %s\n", project.Name, process.ID, process.State)

				logged, err := t.logs(project.Name, process.ID, lines)
				if err != nil {
					fmt.Fprintln(&text, describe(err))

					continue
				}

				for _, line := range logged {
					fmt.Fprintln(&text, line)
				}
			}

			return Text(text.String()), nil
		},
	}
}

type pulled struct {
	settled
	Pulled    bool     `json:"pulled"`
	Branch    string   `json:"branch,omitempty"`
	Commit    string   `json:"commit,omitempty"`
	Dirty     bool     `json:"dirty,omitempty"`
	Restarted []string `json:"restarted"`
}

func (t Toolbox) projectPull() Tool {
	return Tool{
		Name:  "project_pull",
		Title: "Pull a project's code",
		Description: "Fetch the commits pushed to the project's branch into its folder on this server (git pull --rebase --autostash), " +
			"then restart the processes that were not stopped and wait until each one is online or failed. " +
			"Use it after pushing from a clone on another computer: the server does not see a commit that was not pushed.",
		InputSchema: object(map[string]any{
			"project":      map[string]any{"type": "string", "description": "The project's name, as project_list gives it."},
			"restart":      map[string]any{"type": "boolean", "description": "Restart the processes that were not stopped. Default true."},
			"wait_seconds": integer(fmt.Sprintf("How long to wait for the restarted processes to settle. Default %d, at most %d.", DefaultWait, MaxWait), 0, MaxWait),
		}, "project"),
		Annotations: Annotations{OpenWorld: true},
		Run: func(raw json.RawMessage) (Result, error) {
			var asked struct {
				Project string `json:"project"`
				Restart *bool  `json:"restart"`
				Wait    *int   `json:"wait_seconds"`
			}

			if err := decode(raw, &asked); err != nil {
				return Result{}, err
			}

			project, err := t.project(asked.Project)
			if err != nil {
				return Result{}, err
			}

			answer, err := t.call("project.pull", map[string]any{"name": project.Name})
			if err != nil {
				return Result{}, err
			}

			fetched, err := as[contract.ProjectPull](answer)
			if err != nil {
				return Result{}, err
			}

			report := pulled{Pulled: fetched.Pulled, Restarted: []string{}}

			if git, err := t.gitStatus(project.Name); err == nil {
				report.Branch, report.Commit, report.Dirty = git.Current, git.Subject, git.Dirty
			}

			if asked.Restart == nil || *asked.Restart {
				for _, process := range project.Processes {
					if process.State == contract.ProcessStopped {
						continue
					}

					if _, err := t.call("project.restart", target{Project: project.Name, Process: process.ID}.params()); err != nil {
						return Result{}, err
					}

					report.Restarted = append(report.Restarted, process.ID)
				}
			}

			wait := waitOf(asked.Wait)
			if len(report.Restarted) == 0 {
				wait = 0
			}

			report.settled, err = t.settled(target{Project: project.Name}, wait)
			if err != nil {
				return Result{}, err
			}

			return encoded(report)
		},
	}
}

func (t Toolbox) projectGitStatus() Tool {
	return Tool{
		Name:        "project_git_status",
		Title:       "Read a project's git state",
		Description: "The branch checked out in the project's folder on this server, its upstream, how many commits it is behind and ahead, whether files changed, and the last commit's subject.",
		InputSchema: object(map[string]any{"project": map[string]any{"type": "string", "description": "The project's name, as project_list gives it."}}, "project"),
		Annotations: Annotations{ReadOnly: true, Idempotent: true},
		Run: func(raw json.RawMessage) (Result, error) {
			var asked struct {
				Project string `json:"project"`
			}

			if err := decode(raw, &asked); err != nil {
				return Result{}, err
			}

			return t.relay("project.git_status", map[string]any{"name": asked.Project})
		},
	}
}

func (t Toolbox) serviceAction(name, title, cmd, description string) Tool {
	return Tool{
		Name:        name,
		Title:       title,
		Description: description,
		InputSchema: object(map[string]any{"service": serviceProperty}, "service"),
		Annotations: Annotations{Idempotent: cmd != "service.restart"},
		Run: func(raw json.RawMessage) (Result, error) {
			var asked struct {
				Service string `json:"service"`
			}

			if err := decode(raw, &asked); err != nil {
				return Result{}, err
			}

			return t.relay(cmd, map[string]any{"id": asked.Service})
		},
	}
}

func (t Toolbox) serviceLogs() Tool {
	return Tool{
		Name:        "service_logs",
		Title:       "Read a service's logs",
		Description: "The last lines of a service's journal, by its id as status lists it.",
		InputSchema: object(map[string]any{
			"service": serviceProperty,
			"lines":   integer(fmt.Sprintf("How many lines. Default %d, at most %d.", DefaultLines, MaxLines), 1, MaxLines),
		}, "service"),
		Annotations: Annotations{ReadOnly: true, Idempotent: true},
		Run: func(raw json.RawMessage) (Result, error) {
			var asked struct {
				Service string `json:"service"`
				Lines   int    `json:"lines"`
			}

			if err := decode(raw, &asked); err != nil {
				return Result{}, err
			}

			lines := DefaultLines
			if asked.Lines > 0 {
				lines = min(asked.Lines, MaxLines)
			}

			answer, err := t.call("service.logs", map[string]any{"id": asked.Service, "lines": lines})
			if err != nil {
				return Result{}, err
			}

			logged, err := as[struct {
				Lines []string `json:"lines"`
			}](answer)
			if err != nil {
				return Result{}, err
			}

			return Text(strings.Join(logged.Lines, "\n")), nil
		},
	}
}

func (t Toolbox) dbQuery() Tool {
	return Tool{
		Name:  "db_query",
		Title: "Query a database",
		Description: "Run SQL on the server's PostgreSQL or MySQL/MariaDB, a mongosh script on its MongoDB, or commands on its Redis, " +
			"as the application account, and read what the engine's client prints. SQL statements may follow one another and stop at the first error. " +
			"A mongosh script answers with its last expression: end a find with .toArray(). Redis takes one command per line, each answered in turn. " +
			"The owner can turn this off per database in the Pupitre app.",
		InputSchema: object(map[string]any{
			"engine": map[string]any{"type": "string", "description": "postgres, mysql (MySQL or MariaDB), mongodb or redis."},
			"database": map[string]any{
				"type": "string",
				"description": "The database, as the engine names it; for redis its number, 0 to 15. " +
					"Left out: postgres, mysql, admin or 0, from which the others are listed.",
			},
			"query": map[string]any{
				"type":        "string",
				"description": "SQL for postgres and mysql, a mongosh script for mongodb, commands one per line for redis.",
				"minLength":   1,
				"maxLength":   contract.DbQuery.QueryMaxLength,
			},
		}, "engine", "query"),
		Annotations: Annotations{Destructive: true},
		Run: func(raw json.RawMessage) (Result, error) {
			var asked struct {
				Engine   string `json:"engine"`
				Database string `json:"database"`
				Query    string `json:"query"`
			}

			if err := decode(raw, &asked); err != nil {
				return Result{}, err
			}

			params := map[string]any{"engine": asked.Engine, "query": asked.Query}
			if asked.Database != "" {
				params["name"] = asked.Database
			}

			answer, err := t.call("db.query", params)
			if err != nil {
				return Result{}, err
			}

			queried, err := as[struct {
				Output    string `json:"output"`
				Truncated bool   `json:"truncated"`
				Failed    bool   `json:"failed"`
			}](answer)
			if err != nil {
				return Result{}, err
			}

			text := queried.Output
			if strings.TrimSpace(text) == "" {
				text = "The statement ran and printed nothing."
			}

			if queried.Truncated {
				text = strings.TrimRight(text, "\n") + fmt.Sprintf("\n[Cut at %d bytes: narrow the query with LIMIT, fewer columns or a projection.]", contract.DbQuery.OutputMaxBytes)
			}

			result := Text(text)
			result.IsError = queried.Failed

			return result, nil
		},
	}
}

func (t Toolbox) doctor() Tool {
	return Tool{
		Name:        "doctor",
		Title:       "Check the server",
		Description: "Pupitre's checks of the machine: each one passed or not, with the fix to apply when it did not.",
		InputSchema: object(nil),
		Annotations: Annotations{ReadOnly: true, Idempotent: true},
		Run: func(raw json.RawMessage) (Result, error) {
			if err := decode(raw, &struct{}{}); err != nil {
				return Result{}, err
			}

			return t.relay("doctor", nil)
		},
	}
}

type settled struct {
	Project   string            `json:"project"`
	State     string            `json:"state"`
	Processes []settledProcess  `json:"processes"`
	Logs      map[string]string `json:"logs,omitempty"`
	Note      string            `json:"note,omitempty"`
}

type settledProcess struct {
	ID    string `json:"id"`
	State string `json:"state"`
	Port  int    `json:"port,omitempty"`
	URL   string `json:"url,omitempty"`
}

// Polls the registry rather than following a log: online is a port that answers, which only the agent reads.
func (t Toolbox) settled(asked target, wait time.Duration) (settled, error) {
	deadline := t.Now().Add(wait)

	for {
		project, err := t.project(asked.Project)
		if err != nil {
			return settled{}, err
		}

		processes, err := chosen(project, asked.Process)
		if err != nil {
			return settled{}, err
		}

		starting := slices.ContainsFunc(processes, func(process contract.ProjectProcess) bool {
			return process.State == contract.ProcessStarting
		})

		if !starting || !t.Now().Before(deadline) {
			answer := t.report(project, processes)

			if starting {
				answer.Note = fmt.Sprintf("Still starting after %d s. Call project_start again to keep waiting: it never restarts a process "+
					"that is starting or online. project_logs shows how far it got.", int(wait.Seconds()))
			}

			return answer, nil
		}

		t.Sleep(pollEvery)
	}
}

func (t Toolbox) report(project contract.Project, processes []contract.ProjectProcess) settled {
	answer := settled{Project: project.Name, State: string(project.State), Processes: []settledProcess{}}

	for _, process := range processes {
		answer.Processes = append(answer.Processes, settledProcess{ID: process.ID, State: string(process.State), Port: process.Port, URL: process.URL})

		if process.State != contract.ProcessFailed {
			continue
		}

		if answer.Logs == nil {
			answer.Logs = map[string]string{}
		}

		logged, err := t.logs(project.Name, process.ID, failedTail)
		if err != nil {
			answer.Logs[process.ID] = describe(err)

			continue
		}

		answer.Logs[process.ID] = strings.Join(logged, "\n")
	}

	return answer
}

func (t Toolbox) logs(project, process string, lines int) ([]string, error) {
	answer, err := t.call("project.logs", map[string]any{"name": project, "process": process, "lines": lines})
	if err != nil {
		return nil, err
	}

	logged, err := as[struct {
		Lines []string `json:"lines"`
	}](answer)

	return Plain(logged.Lines), err
}

func waitOf(asked *int) time.Duration {
	if asked == nil {
		return DefaultWait * time.Second
	}

	return time.Duration(min(max(*asked, 0), MaxWait)) * time.Second
}

func (t Toolbox) gitStatus(project string) (contract.ProjectGitStatus, error) {
	answer, err := t.call("project.git_status", map[string]any{"name": project})
	if err != nil {
		return contract.ProjectGitStatus{}, err
	}

	return as[contract.ProjectGitStatus](answer)
}

func (t Toolbox) project(name string) (contract.Project, error) {
	answer, err := t.call("project.list", nil)
	if err != nil {
		return contract.Project{}, err
	}

	listed, err := as[struct {
		Projects []contract.Project `json:"projects"`
	}](answer)
	if err != nil {
		return contract.Project{}, err
	}

	for _, project := range listed.Projects {
		if project.Name == name {
			return project, nil
		}
	}

	names := make([]string, 0, len(listed.Projects))
	for _, project := range listed.Projects {
		names = append(names, project.Name)
	}

	return contract.Project{}, protocol.NewError(contract.ErrorProjectNotFound, i18n.T("mcp.project.unknown", name)).
		WithFix(i18n.T("mcp.project.unknown.fix", strings.Join(names, ", ")))
}

func chosen(project contract.Project, process string) ([]contract.ProjectProcess, error) {
	if process == "" {
		return project.Processes, nil
	}

	for _, candidate := range project.Processes {
		if candidate.ID == process {
			return []contract.ProjectProcess{candidate}, nil
		}
	}

	ids := make([]string, 0, len(project.Processes))
	for _, candidate := range project.Processes {
		ids = append(ids, candidate.ID)
	}

	return nil, protocol.NewError(contract.ErrorProjectNotFound, i18n.T("mcp.process.unknown", process, project.Name)).
		WithFix(i18n.T("mcp.process.unknown.fix", strings.Join(ids, ", ")))
}

// Limited commands only: sudo would ask the privileged session's password on a terminal this process does not have.
func (t Toolbox) call(cmd string, params map[string]any) (any, error) {
	if params == nil {
		params = map[string]any{}
	}

	return t.Agent.Call(cmd, params, nil)
}

func (t Toolbox) relay(cmd string, params map[string]any) (Result, error) {
	answer, err := t.call(cmd, params)
	if err != nil {
		return Result{}, err
	}

	return encoded(answer)
}

func encoded(value any) (Result, error) {
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return Result{}, err
	}

	return Text(string(raw)), nil
}

func decode(raw json.RawMessage, into any) error {
	if len(bytes.TrimSpace(raw)) == 0 || string(bytes.TrimSpace(raw)) == "null" {
		raw = json.RawMessage("{}")
	}

	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(into); err != nil {
		return errors.New(i18n.T("mcp.arguments.invalid", err.Error()))
	}

	return nil
}

func as[T any](value any) (T, error) {
	var typed T

	raw, err := json.Marshal(value)
	if err != nil {
		return typed, err
	}

	return typed, json.Unmarshal(raw, &typed)
}

func describe(err error) string {
	var refusal *protocol.Error
	if errors.As(err, &refusal) && refusal.Fix != "" {
		return refusal.Message + "\n" + refusal.Fix
	}

	if errors.As(err, &refusal) {
		return refusal.Message
	}

	return err.Error()
}

var (
	projectProperty = map[string]any{"type": "string", "description": "The project's name, as project_list gives it; all for every project at once."}
	processProperty = map[string]any{"type": "string", "description": "One process of the project, by its id. Every process when left out."}
	serviceProperty = map[string]any{"type": "string", "description": "The service's id, as status lists it: db.postgres, db.redis, …"}
)

func object(properties map[string]any, required ...string) map[string]any {
	if properties == nil {
		properties = map[string]any{}
	}

	schema := map[string]any{"type": "object", "properties": properties, "additionalProperties": false}
	if len(required) > 0 {
		schema["required"] = required
	}

	return schema
}

func integer(description string, minimum, maximum int) map[string]any {
	return map[string]any{"type": "integer", "description": description, "minimum": minimum, "maximum": maximum}
}
