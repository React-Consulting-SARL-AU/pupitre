package main

import (
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/i18n"
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

func runShot(reader *state.Reader, args []string, stdout, stderr io.Writer) int {
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

	capture, err := shots.Take(reader.Context(), shots.Options{Base: reader.ShotsURL(), Now: reader.Now()}, request)
	if err != nil {
		fmt.Fprintln(stderr, err)

		return 1
	}

	fmt.Fprintln(stderr, i18n.T("shot.file", capture.Path))
	fmt.Fprintln(stdout, capture.URL)

	return 0
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

	if err := shots.Serve(dir, port); err != nil {
		fmt.Fprintln(stderr, err)

		return 1
	}

	return 0
}
