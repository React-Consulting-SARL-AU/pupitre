package mcp

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/capture"
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
)

// Read by the model like the tools' descriptions: one language for the whole contract.
const Instructions = "Pupitre drives this server's projects and services. Start, stop and restart a dev server with these tools, " +
	"never by hand: a second process would take its port. Read its logs with project_logs, and look at a page with screenshot."

type Toolbox struct {
	Agent   devcli.Caller
	Capture func(capture.Request) ([]byte, error)
	Sleep   func(time.Duration)
	Now     func() time.Time
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
		t.serviceAction("service_start", "Start a service", "service.start", "Start one of the server's services (a database, Mailpit, …) by its id, as status lists it."),
		t.serviceAction("service_stop", "Stop a service", "service.stop", "Stop one of the server's services by its id, as status lists it."),
		t.serviceAction("service_restart", "Restart a service", "service.restart", "Restart one of the server's services by its id, as status lists it."),
		t.serviceLogs(),
		t.doctor(),
		t.screenshot(),
	}
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

			wait := DefaultWait
			if asked.Wait != nil {
				wait = min(max(*asked.Wait, 0), MaxWait)
			}

			return t.settle(asked.target, time.Duration(wait)*time.Second)
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

func (t Toolbox) screenshot() Tool {
	return Tool{
		Name:  "screenshot",
		Title: "Take a screenshot",
		Description: "Open a page in a headless browser on this server and return the image. Name a project to capture its dev process on the loopback, " +
			"past the access gate, or give a full http(s) URL. The image is returned here and kept nowhere.",
		InputSchema: object(map[string]any{
			"url":     map[string]any{"type": "string", "description": "A full http:// or https:// address. Leave empty when naming a project."},
			"project": map[string]any{"type": "string", "description": "A project whose running process is captured on 127.0.0.1."},
			"process": processProperty,
			"path":    map[string]any{"type": "string", "description": "With a project, the page to open, starting with /. Default /."},
			"width":   integer("Viewport width in pixels. Default 1440, or 390 on mobile.", 320, 3840),
			"height":  integer("Viewport height in pixels. Default 900, or 844 on mobile.", 320, 4320),
			"mobile":  map[string]any{"type": "boolean", "description": "Emulate a phone: its viewport and its user agent."},
			"wait_ms": integer(fmt.Sprintf("Extra time to let the page render, in milliseconds, at most %d.", capture.MaxWait), 0, capture.MaxWait),
		}),
		Annotations: Annotations{ReadOnly: true, OpenWorld: true},
		Run: func(raw json.RawMessage) (Result, error) {
			var asked struct {
				URL     string `json:"url"`
				Project string `json:"project"`
				Process string `json:"process"`
				Path    string `json:"path"`
				Width   int    `json:"width"`
				Height  int    `json:"height"`
				Mobile  bool   `json:"mobile"`
				Wait    int    `json:"wait_ms"`
			}

			if err := decode(raw, &asked); err != nil {
				return Result{}, err
			}

			address, err := t.address(asked.URL, asked.Project, asked.Process, asked.Path)
			if err != nil {
				return Result{}, err
			}

			request := capture.Request{URL: address, Mobile: asked.Mobile, Wait: asked.Wait}
			if asked.Width > 0 || asked.Height > 0 {
				request.Size = size(asked.Width, asked.Height, asked.Mobile)
			}

			image, err := t.Capture(request)
			if err != nil {
				return Result{}, err
			}

			return Result{Content: []Content{
				{Type: "image", Data: base64.StdEncoding.EncodeToString(image), MimeType: "image/png"},
				{Type: "text", Text: address},
			}}, nil
		},
	}
}

func (t Toolbox) address(url, project, process, path string) (string, error) {
	if (url == "") == (project == "") {
		return "", errors.New(i18n.T("mcp.screenshot.target"))
	}

	if url != "" {
		return url, nil
	}

	if path == "" {
		path = "/"
	}

	if !strings.HasPrefix(path, "/") {
		return "", errors.New(i18n.T("mcp.screenshot.path", path))
	}

	found, err := t.project(project)
	if err != nil {
		return "", err
	}

	processes, err := chosen(found, process)
	if err != nil {
		return "", err
	}

	for _, candidate := range processes {
		if candidate.Port > 0 {
			host := candidate.Host
			if host == "" {
				host = "127.0.0.1"
			}

			return "http://" + host + ":" + strconv.Itoa(candidate.Port) + path, nil
		}
	}

	return "", errors.New(i18n.T("mcp.screenshot.noPort", project))
}

func size(width, height int, mobile bool) string {
	fallback := strings.Split(capture.DesktopSize, ",")
	if mobile {
		fallback = strings.Split(capture.MobileSize, ",")
	}

	if width <= 0 {
		width, _ = strconv.Atoi(fallback[0])
	}

	if height <= 0 {
		height, _ = strconv.Atoi(fallback[1])
	}

	return strconv.Itoa(width) + "," + strconv.Itoa(height)
}

type settled struct {
	Project   string            `json:"project"`
	State     string            `json:"state"`
	Processes []settledProcess  `json:"processes"`
	Logs      map[string]string `json:"logs,omitempty"`
}

type settledProcess struct {
	ID    string `json:"id"`
	State string `json:"state"`
	Port  int    `json:"port,omitempty"`
	URL   string `json:"url,omitempty"`
}

// Polls the registry rather than following a log: online is a port that answers, which only the agent reads.
func (t Toolbox) settle(asked target, wait time.Duration) (Result, error) {
	deadline := t.Now().Add(wait)

	for {
		project, err := t.project(asked.Project)
		if err != nil {
			return Result{}, err
		}

		processes, err := chosen(project, asked.Process)
		if err != nil {
			return Result{}, err
		}

		starting := slices.ContainsFunc(processes, func(process contract.ProjectProcess) bool {
			return process.State == contract.ProcessStarting
		})

		if !starting || !t.Now().Before(deadline) {
			return t.report(project, processes)
		}

		t.Sleep(pollEvery)
	}
}

func (t Toolbox) report(project contract.Project, processes []contract.ProjectProcess) (Result, error) {
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

	return encoded(answer)
}

func (t Toolbox) logs(project, process string, lines int) ([]string, error) {
	answer, err := t.call("project.logs", map[string]any{"name": project, "process": process, "lines": lines})
	if err != nil {
		return nil, err
	}

	logged, err := as[struct {
		Lines []string `json:"lines"`
	}](answer)

	return logged.Lines, err
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
