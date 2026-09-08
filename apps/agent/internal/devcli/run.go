package devcli

import (
	"encoding/json"
	"fmt"
	"io"
	"pupitre.studio/agent/internal/i18n"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/tmux"
)

const Usage = `usage: pupitred dev <commande> [arguments] [--json]

  up|down|restart <projet|all>   démarre, arrête, redémarre
  status                         ce qui tourne, les ports, les services
  logs <projet> [-f] [-n N]      les dernières lignes du journal
  sync <projet>                  git pull puis dépendances
  attach <projet>                la commande tmux qui ouvre sa fenêtre
  branch [projet] [branche]      les branches, ou change de branche
  db <url|shell|dump|import> [moteur]
  doctor                         diagnostic court

--json rend la réponse du protocole telle quelle. doctor sort en 1 si un point
est à corriger.
`

type Options struct {
	Server *protocol.Server
	Tmux   tmux.Options
}

type request struct {
	verb   string
	words  []string
	json   bool
	follow bool
	lines  int
}

// The driving commands as a human types them. Every verb goes through the protocol handler the app calls, so a terminal and the app never see two different machines.
func Run(options Options, args []string, stdout, stderr io.Writer) int {
	asked, err := parse(args)
	if err != nil {
		fmt.Fprintln(stderr, err)
		fmt.Fprint(stderr, Usage)

		return 2
	}

	if asked.verb == "" {
		fmt.Fprint(stderr, Usage)

		return 2
	}

	run, known := verbs[asked.verb]
	if !known {
		fmt.Fprintf(stderr, "unknown command: %s\n", asked.verb)
		fmt.Fprint(stderr, Usage)

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
				return asked, fmt.Errorf("-n attend un nombre de lignes")
			}
			asked.lines = count
		case strings.HasPrefix(argument, "-"):
			return asked, fmt.Errorf("option inconnue : %s", argument)
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
}

func action(cmd string) handler {
	return func(options Options, asked request, out *printer) int {
		name, err := target(asked)
		if err != nil {
			return out.usage(err)
		}

		result, err := options.Server.Call(cmd, map[string]any{"name": name}, nil)
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

	params := map[string]any{"name": name, "follow": asked.follow}
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
		out.line(fmt.Sprintf("%s · %s · %s · %s", name, done(value.Pulled, "pull", "already up to date"), done(value.Installed, "dependencies", "dependencies unchanged"), value.State))
	})
}

// The command, not the attachment: pupitred answers on a channel that has no terminal, and a human pastes the line his own terminal will run.
func runAttach(options Options, asked request, out *printer) int {
	name, err := target(asked)
	if err != nil {
		return out.usage(err)
	}

	result, err := options.Server.Call("project.list", nil, nil)
	if err != nil {
		return out.failure(err)
	}

	listed, err := as[struct {
		Projects []contract.Project `json:"projects"`
	}](result)
	if err != nil {
		return out.failure(err)
	}

	if !holds(listed.Projects, name) {
		return out.failure(protocol.NewError(contract.ErrorProjectNotFound, i18n.T("registry.project.unknown", name)).
			WithFix(i18n.T("devcli.project.unknown.fix")))
	}

	command := "tmux attach-session -t " + tmux.Target(options.Tmux, name)

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
			out.line(name + " is not in a git repository")

			return
		}

		out.line(fmt.Sprintf("%s · %s%s", name, value.Current, when(value.Dirty, " · uncommitted changes")))
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
		return out.usage(fmt.Errorf("db attend url, shell, dump ou import"))
	}

	cmd, known := databases[asked.words[0]]
	if !known {
		return out.usage(fmt.Errorf("db %s : choisis url, shell, dump ou import", asked.words[0]))
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

// One database on the machine and the engine goes without saying; two, and the human says which.
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
		return "", fmt.Errorf("%s expects a project", asked.verb)
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

func holds(projects []contract.Project, name string) bool {
	for _, project := range projects {
		if project.Name == name {
			return true
		}
	}

	return false
}

func at(args []string, index int) string {
	if index >= len(args) {
		return ""
	}

	return args[index]
}
