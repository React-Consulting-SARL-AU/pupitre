package mcp_test

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/mcp"
	"pupitre.studio/agent/internal/protocol"
)

type call struct {
	cmd    string
	params map[string]any
}

// Answers project.list from a script of states, one step per poll, and every other command from a table.
type agent struct {
	calls    []call
	states   [][]contract.ProcessState
	listed   int
	answers  map[string]any
	refuse   map[string]error
	declared []contract.Project
}

func (a *agent) Call(cmd string, params any, _ func(string, map[string]any)) (any, error) {
	asked, _ := params.(map[string]any)
	if asked == nil {
		return nil, protocol.NewError(contract.ErrorBadRequest, "invalid request: /params: must be an object")
	}

	a.calls = append(a.calls, call{cmd: cmd, params: asked})

	if err := a.refuse[cmd]; err != nil {
		return nil, err
	}

	if cmd == "project.list" && a.declared != nil {
		return map[string]any{"projects": a.declared}, nil
	}

	if cmd == "project.list" {
		return a.projects(), nil
	}

	if answer, found := a.answers[cmd]; found {
		return answer, nil
	}

	return map[string]any{"done": true}, nil
}

func (a *agent) projects() map[string]any {
	states := []contract.ProcessState{contract.ProcessStopped, contract.ProcessStopped}
	if len(a.states) > 0 {
		states = a.states[min(a.listed, len(a.states)-1)]
		a.listed++
	}

	return map[string]any{"projects": []contract.Project{{
		Name:  "flyleaf",
		State: contract.ProjectState(states[0]),
		Processes: []contract.ProjectProcess{
			{ID: "api", Host: "127.0.0.1", Port: 5173, State: states[0]},
			{ID: "web", Host: "127.0.0.1", Port: 5174, State: states[1]},
		},
	}}}
}

func (a *agent) commands() []string {
	var cmds []string
	for _, made := range a.calls {
		cmds = append(cmds, made.cmd)
	}

	return cmds
}

type clock struct {
	now   time.Time
	slept time.Duration
}

func toolbox(fake *agent, at *clock) mcp.Toolbox {
	return mcp.Toolbox{
		Agent: fake,
		Sleep: func(step time.Duration) {
			at.slept += step
			at.now = at.now.Add(step)
		},
		Now: func() time.Time { return at.now },
	}
}

func run(t *testing.T, box mcp.Toolbox, name, arguments string) mcp.Result {
	t.Helper()

	for _, tool := range box.Tools() {
		if tool.Name != name {
			continue
		}

		result, err := tool.Run(json.RawMessage(arguments))
		if err != nil {
			return mcp.Refusal(err)
		}

		return result
	}

	t.Fatalf("no tool %s", name)

	return mcp.Result{}
}

func TestStartingAProjectWaitsUntilItsProcessesSettle(t *testing.T) {
	fake := &agent{states: [][]contract.ProcessState{
		{contract.ProcessStarting, contract.ProcessStarting},
		{contract.ProcessOnline, contract.ProcessStarting},
		{contract.ProcessOnline, contract.ProcessOnline},
	}}
	at := &clock{}

	result := run(t, toolbox(fake, at), "project_start", `{"project":"flyleaf"}`)
	if result.IsError {
		t.Fatalf("refused: %s", result.Content[0].Text)
	}

	if fake.calls[0].cmd != "project.up" || fake.calls[0].params["name"] != "flyleaf" {
		t.Fatalf("calls = %+v", fake.calls)
	}

	if _, named := fake.calls[0].params["process"]; named {
		t.Fatal("no process named means the whole project")
	}

	if at.slept != 2*time.Second {
		t.Fatalf("slept %s, want one poll per second until nothing is starting", at.slept)
	}

	if text := result.Content[0].Text; !strings.Contains(text, `"state": "online"`) || strings.Contains(text, "starting") {
		t.Fatalf("report = %s", text)
	}
}

func TestAFailedProcessComesBackWithTheEndOfItsLog(t *testing.T) {
	fake := &agent{
		states:  [][]contract.ProcessState{{contract.ProcessFailed, contract.ProcessOnline}},
		answers: map[string]any{"project.logs": map[string]any{"lines": []string{"=== pupitre up ===", "Error: Cannot find module 'vite'"}}},
	}

	result := run(t, toolbox(fake, &clock{}), "project_restart", `{"project":"flyleaf","process":"api"}`)

	if fake.calls[0].cmd != "project.restart" || fake.calls[0].params["process"] != "api" {
		t.Fatalf("calls = %+v", fake.calls)
	}

	logs := fake.calls[len(fake.calls)-1]
	if logs.cmd != "project.logs" || logs.params["process"] != "api" || logs.params["lines"] != 40 {
		t.Fatalf("the failed process's tail is read: %+v", logs)
	}

	if !strings.Contains(result.Content[0].Text, "Cannot find module 'vite'") {
		t.Fatalf("report = %s", result.Content[0].Text)
	}
}

func TestTheWaitStopsAtItsLimit(t *testing.T) {
	fake := &agent{states: [][]contract.ProcessState{{contract.ProcessStarting, contract.ProcessStarting}}}
	at := &clock{}

	result := run(t, toolbox(fake, at), "project_start", `{"project":"flyleaf","wait_seconds":5}`)

	if at.slept != 5*time.Second || !strings.Contains(result.Content[0].Text, "starting") {
		t.Fatalf("slept %s, report %s", at.slept, result.Content[0].Text)
	}

	if !strings.Contains(result.Content[0].Text, "project_start again") {
		t.Fatalf("a process still starting tells the model how to keep waiting: %s", result.Content[0].Text)
	}

	none := &agent{states: fake.states}
	if run(t, toolbox(none, &clock{}), "project_start", `{"project":"flyleaf","wait_seconds":0}`); slices.Contains(none.commands()[1:], "project.up") {
		t.Fatal("one start only")
	}
}

func TestAllProjectsAreStartedWithoutWaitingOnANameThatIsNoProject(t *testing.T) {
	fake := &agent{answers: map[string]any{"project.up": map[string]any{"state": "online"}}}

	result := run(t, toolbox(fake, &clock{}), "project_start", `{"project":"all"}`)

	if result.IsError || !slices.Equal(fake.commands(), []string{"project.up"}) {
		t.Fatalf("calls = %v, result %+v", fake.commands(), result)
	}
}

func TestLogsReadEveryProcessUnlessOneIsNamed(t *testing.T) {
	fake := &agent{answers: map[string]any{"project.logs": map[string]any{"lines": []string{"ready on 5173"}}}}

	result := run(t, toolbox(fake, &clock{}), "project_logs", `{"project":"flyleaf","lines":50}`)

	text := result.Content[0].Text
	if !strings.Contains(text, "flyleaf/api") || !strings.Contains(text, "flyleaf/web") || strings.Count(text, "ready on 5173") != 2 {
		t.Fatalf("logs = %s", text)
	}

	for _, made := range fake.calls[1:] {
		if made.cmd != "project.logs" || made.params["lines"] != 50 {
			t.Fatalf("calls = %+v", fake.calls)
		}
	}

	big := &agent{}
	run(t, toolbox(big, &clock{}), "project_logs", `{"project":"flyleaf","process":"web","lines":99999}`)

	if len(big.calls) != 2 || big.calls[1].params["lines"] != mcp.MaxLines || big.calls[1].params["process"] != "web" {
		t.Fatalf("calls = %+v", big.calls)
	}
}

func TestLogsReadAsTheTerminalLastShowedThem(t *testing.T) {
	redrawn := []string{"<==> 16% EXECUTING [1s]\x1b[0K", "\x1b[1A\x1b[2K\x1b[31;1m> Task :server:compileGroovy\x1b[0;39m FAILED"}
	fake := &agent{
		states:  [][]contract.ProcessState{{contract.ProcessFailed, contract.ProcessOnline}},
		answers: map[string]any{"project.logs": map[string]any{"lines": redrawn}},
	}

	logs := run(t, toolbox(fake, &clock{}), "project_logs", `{"project":"flyleaf","process":"api"}`).Content[0].Text
	restarted := run(t, toolbox(fake, &clock{}), "project_restart", `{"project":"flyleaf","process":"api"}`).Content[0].Text

	for _, text := range []string{logs, restarted} {
		if strings.Contains(text, "\x1b") || strings.Contains(text, "\\u001b") || strings.Contains(text, "EXECUTING") {
			t.Fatalf("terminal sequences reached the model: %q", text)
		}

		if !strings.Contains(text, "Task :server:compileGroovy FAILED") {
			t.Fatalf("the last frame is lost: %q", text)
		}
	}
}

func intranet() []contract.Project {
	public := false

	return []contract.Project{{
		Name:      "intranet",
		Path:      "/home/dev/projects/intranet",
		Repo:      "https://github.com/eapc-dev/intranet.git",
		Branch:    "feat/member-messaging",
		State:     contract.ProjectState(contract.ProcessFailed),
		Protected: true,
		Processes: []contract.ProjectProcess{
			{ID: "server", Host: "127.0.0.1", Port: 8081, State: contract.ProcessFailed, URL: "https://api-intranet.example.dev"},
			{ID: "client", Host: "127.0.0.1", Port: 3001, State: contract.ProcessOnline, URL: "https://intranet.example.dev", Protected: &public},
			{ID: "worker", Host: "127.0.0.1", Port: 3002, State: contract.ProcessStopped},
		},
	}}
}

func TestTheInstructionsNameEachProjectAndWhereItsCodeComesFrom(t *testing.T) {
	text := toolbox(&agent{declared: intranet()}, &clock{}).Instructions()

	for _, expected := range []string{
		mcp.Instructions,
		"intranet",
		"https://github.com/eapc-dev/intranet.git",
		"feat/member-messaging",
		"project_pull",
		"server: 127.0.0.1:8081, https://api-intranet.example.dev, behind Pupitre's access gate",
		"client: 127.0.0.1:3001, https://intranet.example.dev, public",
	} {
		if !strings.Contains(text, expected) {
			t.Fatalf("instructions miss %q:\n%s", expected, text)
		}
	}

	if !strings.HasSuffix(text, "- worker: 127.0.0.1:3002") {
		t.Fatalf("a process without an address names only its port:\n%s", text)
	}

	if strings.Contains(text, "failed") || strings.Contains(text, "online") {
		t.Fatalf("a state read at the session's start would be stale by the first call:\n%s", text)
	}

	unreachable := &agent{refuse: map[string]error{"project.list": protocol.NewError(contract.ErrorLicenseRequired, "a licence is required")}}
	if got := toolbox(unreachable, &clock{}).Instructions(); got != mcp.Instructions {
		t.Fatalf("an agent that does not answer leaves the fixed text: %s", got)
	}
}

func TestPullingRestartsWhatWasRunning(t *testing.T) {
	fake := &agent{
		declared: intranet(),
		answers: map[string]any{
			"project.pull":       map[string]any{"pulled": true, "state": "failed"},
			"project.git_status": map[string]any{"repo": true, "current": "feat/member-messaging", "subject": "fix: rename the private markRead", "dirty": false},
		},
	}

	result := run(t, toolbox(fake, &clock{}), "project_pull", `{"project":"intranet"}`)
	if result.IsError {
		t.Fatalf("refused: %s", result.Content[0].Text)
	}

	var restarted []string
	for _, made := range fake.calls {
		if made.cmd == "project.restart" {
			restarted = append(restarted, made.params["process"].(string))
		}
	}

	if !slices.Equal(restarted, []string{"server", "client"}) {
		t.Fatalf("restarted %v, want the processes that were not stopped", restarted)
	}

	if fake.commands()[1] != "project.pull" || fake.calls[1].params["name"] != "intranet" {
		t.Fatalf("calls = %v", fake.commands())
	}

	text := result.Content[0].Text
	for _, expected := range []string{`"pulled": true`, `"branch": "feat/member-messaging"`, `"commit": "fix: rename the private markRead"`, `"restarted": [`} {
		if !strings.Contains(text, expected) {
			t.Fatalf("report misses %s: %s", expected, text)
		}
	}
}

func TestPullingWithoutARestartLeavesTheProcesses(t *testing.T) {
	fake := &agent{declared: intranet()}

	run(t, toolbox(fake, &clock{}), "project_pull", `{"project":"intranet","restart":false}`)

	if slices.Contains(fake.commands(), "project.restart") {
		t.Fatalf("calls = %v", fake.commands())
	}

	refused := &agent{declared: intranet(), refuse: map[string]error{"project.pull": protocol.NewError(contract.ErrorInternal, "git pull failed").WithFix("Commit or drop the changes.")}}
	result := run(t, toolbox(refused, &clock{}), "project_pull", `{"project":"intranet"}`)

	if !result.IsError || slices.Contains(refused.commands(), "project.restart") || !strings.Contains(result.Content[0].Text, "Commit or drop") {
		t.Fatalf("a refused pull restarts nothing: %v, %+v", refused.commands(), result)
	}
}

func TestGitStatusIsTheAgents(t *testing.T) {
	fake := &agent{answers: map[string]any{"project.git_status": map[string]any{"behind": 2}}}

	result := run(t, toolbox(fake, &clock{}), "project_git_status", `{"project":"flyleaf"}`)

	if fake.calls[0].cmd != "project.git_status" || fake.calls[0].params["name"] != "flyleaf" || !strings.Contains(result.Content[0].Text, `"behind": 2`) {
		t.Fatalf("calls = %+v, result %+v", fake.calls, result)
	}
}

func TestAnUnknownProjectNamesTheOnesThere(t *testing.T) {
	result := run(t, toolbox(&agent{}, &clock{}), "project_logs", `{"project":"shop"}`)

	if !result.IsError || !strings.Contains(result.Content[0].Text, "shop") || !strings.Contains(result.Content[0].Text, "flyleaf") {
		t.Fatalf("result = %+v", result)
	}

	process := run(t, toolbox(&agent{}, &clock{}), "project_stop", `{"project":"flyleaf","process":"worker","extra":1}`)
	if !process.IsError || !strings.Contains(process.Content[0].Text, "extra") {
		t.Fatalf("an argument the tool does not name is refused: %+v", process)
	}
}

func TestServiceToolsNameTheServiceById(t *testing.T) {
	fake := &agent{answers: map[string]any{"service.logs": map[string]any{"lines": []string{"ready to accept connections"}}}}
	box := toolbox(fake, &clock{})

	run(t, box, "service_restart", `{"service":"db.postgres"}`)
	logs := run(t, box, "service_logs", `{"service":"db.postgres"}`)

	if fake.calls[0].cmd != "service.restart" || fake.calls[0].params["id"] != "db.postgres" {
		t.Fatalf("calls = %+v", fake.calls)
	}

	if fake.calls[1].params["lines"] != mcp.DefaultLines || logs.Content[0].Text != "ready to accept connections" {
		t.Fatalf("calls = %+v, logs %+v", fake.calls, logs)
	}
}

func TestAnAgentRefusalReachesTheModelWithItsFix(t *testing.T) {
	fake := &agent{refuse: map[string]error{
		"status": protocol.NewError(contract.ErrorLicenseRequired, "a licence is required").WithFix("Ask the owner."),
	}}

	result := run(t, toolbox(fake, &clock{}), "status", `{}`)
	if !result.IsError || result.Content[0].Text != "a licence is required\nAsk the owner." {
		t.Fatalf("result = %+v", result)
	}
}

func TestThePagesAreTheBrowsersToShow(t *testing.T) {
	for _, tool := range toolbox(&agent{}, &clock{}).Tools() {
		if tool.Name == "screenshot" {
			t.Fatal("pages are looked at through the playwright server, not through pupitre")
		}
	}

	if !strings.Contains(mcp.Instructions, "playwright") {
		t.Fatalf("the instructions must send the model to the browser: %s", mcp.Instructions)
	}
}

func TestNoToolOpensThePrivilegedSession(t *testing.T) {
	fake := &agent{}
	box := toolbox(fake, &clock{})

	values := map[string]any{"project": "flyleaf", "service": "db.postgres"}

	for _, tool := range box.Tools() {
		arguments := map[string]any{}
		required, _ := tool.InputSchema["required"].([]string)

		for _, key := range required {
			arguments[key] = values[key]
		}

		raw, _ := json.Marshal(arguments)
		before := len(fake.calls)

		if result := run(t, box, tool.Name, string(raw)); result.IsError {
			t.Errorf("%s refused %s: %s", tool.Name, raw, result.Content[0].Text)
		}

		if len(fake.calls) == before {
			t.Errorf("%s never reached the agent", tool.Name)
		}
	}

	for _, made := range fake.calls {
		if contract.RequiresPrivilege(made.cmd, made.params) {
			t.Errorf("%s reached the agent, and only the privileged session answers it", made.cmd)
		}
	}
}
