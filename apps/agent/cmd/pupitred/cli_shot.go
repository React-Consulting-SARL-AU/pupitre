package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/shots"
	"pupitre.studio/agent/internal/state"
)

// Symlinks named shot and dev make the binary itself the driving commands, never a script laid on the client's disk.
func arguments(argv []string) []string {
	if len(argv) == 0 {
		return nil
	}

	if name := filepath.Base(argv[0]); name == shots.Command || name == devcli.Command {
		return append([]string{name}, argv[1:]...)
	}

	return argv[1:]
}

// The projects and the gallery's public address are root's to read: dev asks the agent, as dev's verbs do.
func runShotCommand(engine *modules.Engine, args []string, stdout, stderr io.Writer) int {
	local := func() devcli.Caller { return newServer(engine, false) }

	var agent devcli.Caller

	caller, err := devcli.RealElevation(engine.Sys, tokenPath(), licensePath()).Caller(local, version)
	if err != nil {
		agent = unreachable{err: err}
	} else {
		agent = caller
	}

	if remote, isRemote := caller.(*devcli.Remote); isRemote {
		defer remote.Close()
	}

	cwd, _ := os.Getwd()

	return runShot(state.FromEngine(engine, stateOptions()), agent, cwd, args, stdout, stderr)
}

type unreachable struct {
	err error
}

func (u unreachable) Call(string, any, func(string, map[string]any)) (any, error) {
	return nil, u.err
}

func runShot(reader *state.Reader, agent devcli.Caller, cwd string, args []string, stdout, stderr io.Writer) int {
	request, list, err := parseShot(args)
	if err != nil {
		fmt.Fprintln(stderr, err)
		fmt.Fprint(stderr, i18n.T("shot.usage"))

		return 2
	}

	if list {
		for _, shot := range reader.Shots() {
			fmt.Fprintln(stdout, shot.Path)
		}

		return 0
	}

	project, err := shotProject(agent, request, cwd, stderr)
	if err != nil {
		fmt.Fprintln(stderr, err)

		return 1
	}

	request.Project = project

	capture, err := shots.Take(reader.Context(), shots.Options{Base: galleryBase(agent, stderr), Now: reader.Now()}, request)
	if err != nil {
		fmt.Fprintln(stderr, err)

		return 1
	}

	fmt.Fprintln(stderr, i18n.T("shot.file", capture.Path))
	fmt.Fprintln(stdout, capture.URL)

	return 0
}

// A named project must be one the agent knows: the name becomes a folder of the gallery.
func shotProject(agent devcli.Caller, request shots.Request, cwd string, stderr io.Writer) (string, error) {
	var listed struct {
		Projects []contract.Project `json:"projects"`
	}

	if err := call(agent, "project.list", &listed); err != nil {
		if request.Project != "" {
			return "", err
		}

		fmt.Fprintln(stderr, i18n.T("shot.projects.unread", err))

		return "", nil
	}

	return shots.Resolve(listed.Projects, request.Project, cwd, request.Source)
}

func galleryBase(agent devcli.Caller, stderr io.Writer) string {
	local := "http://127.0.0.1:" + strconv.Itoa(shots.Port)

	var answer struct {
		URL     string `json:"url"`
		Exposed bool   `json:"exposed"`
	}

	if err := call(agent, "shots.url", &answer); err != nil {
		fmt.Fprintln(stderr, i18n.T("shot.url.unread", err))

		return local
	}

	if !answer.Exposed {
		fmt.Fprintln(stderr, i18n.T("shot.url.local"))
	}

	return answer.URL
}

// A local server answers with Go values, a remote one with decoded JSON: both go through JSON once.
func call(agent devcli.Caller, cmd string, into any) error {
	answer, err := agent.Call(cmd, nil, nil)
	if err != nil {
		return err
	}

	raw, err := json.Marshal(answer)
	if err != nil {
		return err
	}

	return json.Unmarshal(raw, into)
}

func parseShot(args []string) (shots.Request, bool, error) {
	request := shots.Request{}

	var positional []string

	for index := 0; index < len(args); index++ {
		argument := args[index]

		switch {
		case argument == "--list":
			return request, true, nil
		case argument == "-m" || argument == "--mobile":
			request.Mobile = true
		case argument == "-s" || argument == "--size":
			index++
			if index >= len(args) {
				return request, false, errors.New(i18n.T("shot.size.expected"))
			}

			request.Size = strings.ReplaceAll(args[index], "x", ",")
		case argument == "-w" || argument == "--wait":
			index++
			milliseconds, err := strconv.Atoi(argumentAt(args, index))
			if err != nil {
				return request, false, errors.New(i18n.T("shot.wait.expected"))
			}

			request.Wait = milliseconds
		case argument == "-p" || argument == "--project":
			index++
			request.Project = argumentAt(args, index)
			if request.Project == "" {
				return request, false, errors.New(i18n.T("shot.project.expected"))
			}
		case strings.HasPrefix(argument, "-"):
			return request, false, errors.New(i18n.T("cli.option.unknown", argument))
		default:
			positional = append(positional, argument)
		}
	}

	if len(positional) == 0 {
		return request, false, errors.New(i18n.T("shot.source.expected"))
	}

	request.Source = positional[0]
	if len(positional) > 1 {
		request.Name = positional[1]
	}

	return request, false, nil
}

func argumentAt(args []string, index int) string {
	if index >= len(args) {
		return ""
	}

	return args[index]
}

func runGallery(args []string, stderr io.Writer) int {
	dir, port := shots.Dir, shots.Port

	for _, argument := range args {
		switch {
		case strings.HasPrefix(argument, "--dir="):
			dir = strings.TrimPrefix(argument, "--dir=")
		case strings.HasPrefix(argument, "--port="):
			parsed, err := strconv.Atoi(strings.TrimPrefix(argument, "--port="))
			if err != nil {
				fmt.Fprintln(stderr, i18n.T("cli.port.unreadable", argument))

				return 2
			}

			port = parsed
		default:
			fmt.Fprintln(stderr, i18n.T("cli.argument.unknown", argument))

			return 2
		}
	}

	// From the environment, never from the command line that ps shows every user.
	if err := shots.Serve(dir, port, os.Getenv(shots.TokenKey)); err != nil {
		fmt.Fprintln(stderr, err)

		return 1
	}

	return 0
}
