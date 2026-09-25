package devcli

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/tmux"
)

type Options struct {
	Server Caller
	Tmux   tmux.Options
}

type request struct {
	verb   string
	words  []string
	json   bool
	follow bool
	lines  int
}

// Every verb goes through the protocol handler the app calls, so a terminal and the app never see two different machines.
func Run(options Options, args []string, stdout, stderr io.Writer) int {
	asked, err := parse(args)
	if err != nil {
		fmt.Fprintln(stderr, err)
		fmt.Fprint(stderr, Usage())

		return 2
	}

	if asked.verb == "" {
		fmt.Fprint(stderr, Usage())

		return 2
	}

	run, known := verbs[asked.verb]
	if !known {
		fmt.Fprintln(stderr, i18n.T("devcli.command.unknown", asked.verb))
		fmt.Fprint(stderr, Usage())

		return 2
	}

	return run(options, asked, &printer{out: stdout, err: stderr, json: asked.json})
}

func parse(args []string) (request, error) {
	asked := request{}

	for index := 0; index < len(args); index++ {
		argument := args[index]

		switch {
		case argument == JSONFlag:
			asked.json = true
		case argument == FollowFlag || argument == "--follow":
			asked.follow = true
		case argument == "-n" || argument == "--lines":
			index++
			count, err := strconv.Atoi(at(args, index))
			if err != nil {
				return asked, errors.New(i18n.T("devcli.lines.expected"))
			}

			asked.lines = count
		case strings.HasPrefix(argument, "-"):
			return asked, errors.New(i18n.T("cli.option.unknown", argument))
		case asked.verb == "":
			asked.verb = argument
		default:
			asked.words = append(asked.words, argument)
		}
	}

	return asked, nil
}

type handler func(Options, request, *printer) int

var verbs = map[string]handler{
	"up":      action("project.up"),
	"down":    action("project.down"),
	"restart": action("project.restart"),
	"status":  runStatus,
	"logs":    runLogs,
	"sync":    runSync,
	"attach":  runAttach,
	"branch":  runBranch,
	"db":      runDB,
	"doctor":  runDoctor,
	"backup":  runBackup,
}

func action(cmd string) handler {
	return func(options Options, asked request, out *printer) int {
		name, err := target(asked)
		if err != nil {
			return out.usage(err)
		}

		params := map[string]any{"name": name}
		if process := at(asked.words, 1); process != "" {
			params["process"] = process
		}

		result, err := options.Server.Call(cmd, params, nil)
		if err != nil {
			return out.failure(err)
		}

		return render(out, result, func(value contract.ProjectActionResult) {
			out.projectAction(name, value)
		})
	}
}

func runStatus(options Options, _ request, out *printer) int {
	result, err := options.Server.Call("status", nil, nil)
	if err != nil {
		return out.failure(err)
	}

	return render(out, result, out.status)
}

func runLogs(options Options, asked request, out *printer) int {
	name, err := target(asked)
	if err != nil {
		return out.usage(err)
	}

	process, err := processOf(options, name, at(asked.words, 1))
	if err != nil {
		return out.failure(err)
	}

	params := map[string]any{"name": name, "process": process, "follow": asked.follow}
	if asked.lines > 0 {
		params["lines"] = asked.lines
	}

	result, err := options.Server.Call("project.logs", params, out.logEvent)
	if err != nil {
		return out.failure(err)
	}

	return render(out, result, func(value struct {
		Lines []string `json:"lines"`
	}) {
		for _, line := range value.Lines {
			out.line(line)
		}
	})
}

func runSync(options Options, asked request, out *printer) int {
	name, err := target(asked)
	if err != nil {
		return out.usage(err)
	}

	result, err := options.Server.Call("project.sync", map[string]any{"name": name}, nil)
	if err != nil {
		return out.failure(err)
	}

	return render(out, result, func(value contract.ProjectSync) {
		pulled := done(value.Pulled, i18n.T("devcli.sync.pulled"), i18n.T("devcli.sync.uptodate"))
		installed := done(value.Installed, i18n.T("devcli.sync.installed"), i18n.T("devcli.sync.unchanged"))

		out.line(fmt.Sprintf("%s · %s · %s · %s", name, pulled, installed, value.State))
	})
}

// Prints the command rather than attaching: pupitred answers on a channel that has no terminal.
func runAttach(options Options, asked request, out *printer) int {
	name, err := target(asked)
	if err != nil {
		return out.usage(err)
	}

	process, err := processOf(options, name, at(asked.words, 1))
	if err != nil {
		return out.failure(err)
	}

	command := "tmux attach-session -t " + tmux.Target(options.Tmux, registry.Window(name, process))

	if out.json {
		return out.raw(map[string]string{"command": command})
	}

	out.line(command)

	return 0
}

func runBranch(options Options, asked request, out *printer) int {
	switch len(asked.words) {
	case 0:
		return branchOfEach(options, out)
	case 1:
		return branchesOf(options, asked.words[0], out)
	default:
		return checkout(options, asked.words[0], asked.words[1], out)
	}
}

func branchOfEach(options Options, out *printer) int {
	result, err := options.Server.Call("status", nil, nil)
	if err != nil {
		return out.failure(err)
	}

	return render(out, result, func(value contract.Status) {
		for _, project := range value.Projects {
			out.line(fmt.Sprintf("%-24s %s", project.Name, project.Branch))
		}
	})
}

func branchesOf(options Options, name string, out *printer) int {
	result, err := options.Server.Call("project.branches", map[string]any{"name": name}, nil)
	if err != nil {
		return out.failure(err)
	}

	return render(out, result, func(value contract.ProjectBranches) {
		if !value.Repo {
			out.line(i18n.T("devcli.branch.norepo", name))

			return
		}

		out.line(fmt.Sprintf("%s · %s%s", name, value.Current, when(value.Dirty, " · "+i18n.T("devcli.branch.dirty"))))

		for _, branch := range value.Local {
			out.line("  " + current(branch == value.Current) + " " + branch)
		}
	})
}

func checkout(options Options, name, branch string, out *printer) int {
	result, err := options.Server.Call("project.checkout", map[string]any{"name": name, "branch": branch}, nil)
	if err != nil {
		return out.failure(err)
	}

	return render(out, result, func(value contract.ProjectCheckout) {
		out.line(name + " · " + value.Branch)
	})
}

var databases = map[string]string{
	"url":    "db.url",
	"shell":  "db.shell",
	"dump":   "db.dump",
	"import": "db.import",
}

func runDB(options Options, asked request, out *printer) int {
	if len(asked.words) == 0 {
		return out.usage(errors.New(i18n.T("devcli.db.expected")))
	}

	cmd, known := databases[asked.words[0]]
	if !known {
		return out.usage(errors.New(i18n.T("devcli.db.unknown", asked.words[0])))
	}

	engine, err := engineOf(options, asked)
	if err != nil {
		return out.failure(err)
	}

	params := map[string]any{"engine": engine}
	if len(asked.words) > 2 {
		params["name"] = asked.words[2]
	}

	result, err := options.Server.Call(cmd, params, nil)
	if err != nil {
		return out.failure(err)
	}

	return render(out, result, func(value map[string]any) {
		for _, key := range []string{"url", "command", "path"} {
			if text, found := value[key].(string); found {
				out.line(text)
			}
		}

		imported, _ := value["imported"].([]any)
		for _, dump := range imported {
			out.line(fmt.Sprint(dump))
		}
	})
}

func engineOf(options Options, asked request) (string, error) {
	if len(asked.words) > 1 {
		return asked.words[1], nil
	}

	result, err := options.Server.Call("status", nil, nil)
	if err != nil {
		return "", err
	}

	status, err := as[contract.Status](result)
	if err != nil {
		return "", err
	}

	var engines []string

	for _, service := range status.Services {
		if engine, found := strings.CutPrefix(service.ID, "db."); found {
			engines = append(engines, engine)
		}
	}

	if len(engines) != 1 {
		return "", protocol.NewError(contract.ErrorBadRequest, i18n.T("devcli.engine.expected")).
			WithFix(i18n.T("devcli.engine.expected.fix", asked.words[0]))
	}

	return engines[0], nil
}

func runBackup(options Options, asked request, out *printer) int {
	switch at(asked.words, 0) {
	case "now":
		result, err := options.Server.Call("backup.run", nil, out.stepEvent)
		if err != nil {
			return out.failure(err)
		}

		return render(out, result, out.backupRun)
	case "status":
		result, err := options.Server.Call("backup.status", nil, nil)
		if err != nil {
			return out.failure(err)
		}

		return render(out, result, out.backupStatus)
	}

	return out.usage(errors.New(i18n.T("devcli.backup.expected")))
}

func runDoctor(options Options, _ request, out *printer) int {
	result, err := options.Server.Call("doctor", nil, nil)
	if err != nil {
		return out.failure(err)
	}

	checks, err := as[struct {
		Checks []contract.DoctorCheck `json:"checks"`
	}](result)
	if err != nil {
		return out.failure(err)
	}

	if out.json {
		return out.raw(result)
	}

	for _, check := range checks.Checks {
		out.line(fmt.Sprintf("%s %-32s %s", mark(check.OK), check.Name, first(check.Message, check.Fix)))
	}

	return failed(checks.Checks)
}

func failed(checks []contract.DoctorCheck) int {
	for _, check := range checks {
		if !check.OK {
			return 1
		}
	}

	return 0
}

func target(asked request) (string, error) {
	if len(asked.words) == 0 {
		return "", errors.New(i18n.T("devcli.project.expected", asked.verb))
	}

	return asked.words[0], nil
}

func as[T any](result any) (T, error) {
	var value T

	raw, err := json.Marshal(result)
	if err != nil {
		return value, err
	}

	return value, json.Unmarshal(raw, &value)
}

func processOf(options Options, name, process string) (string, error) {
	if process != "" {
		return process, nil
	}

	result, err := options.Server.Call("project.list", nil, nil)
	if err != nil {
		return "", err
	}

	listed, err := as[struct {
		Projects []contract.Project `json:"projects"`
	}](result)
	if err != nil {
		return "", err
	}

	for _, project := range listed.Projects {
		if project.Name == name && len(project.Processes) > 0 {
			return project.Processes[0].ID, nil
		}
	}

	return "", protocol.NewError(contract.ErrorProjectNotFound, i18n.T("registry.project.unknown", name)).
		WithFix(i18n.T("devcli.project.unknown.fix"))
}

func at(args []string, index int) string {
	if index >= len(args) {
		return ""
	}

	return args[index]
}
