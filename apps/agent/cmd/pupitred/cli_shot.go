package main

import (
	"fmt"
	"io"
	"path/filepath"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/shots"
	"pupitre.studio/agent/internal/state"
)

const shotUsage = `usage: shot [--mobile|--size LxH] [--wait ms] <fichier|url> [nom]
       shot --list

La dernière ligne écrite est toujours l'URL de la capture, prête à coller ;
le chemin local part sur la sortie d'erreur.
`

// Installed as symlinks named shot and dev, the agent answers to those names: the driving commands are the binary itself, never a script laid on the client's disk.
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
		fmt.Fprint(stderr, shotUsage)

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

	fmt.Fprintf(stderr, "fichier : %s\n", capture.Path)
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
				return request, false, fmt.Errorf("--size attend une taille, par exemple 1024x768")
			}
			request.Size = strings.ReplaceAll(args[index], "x", ",")
		case argument == "-w" || argument == "--wait":
			index++
			milliseconds, err := strconv.Atoi(argumentAt(args, index))
			if err != nil {
				return request, false, fmt.Errorf("--wait attend un nombre de millisecondes")
			}
			request.Wait = milliseconds
		case strings.HasPrefix(argument, "-"):
			return request, false, fmt.Errorf("option inconnue : %s", argument)
		default:
			positional = append(positional, argument)
		}
	}

	if len(positional) == 0 {
		return request, false, fmt.Errorf("il manque le fichier ou l'URL à capturer")
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
				fmt.Fprintf(stderr, "port illisible : %s\n", argument)

				return 2
			}
			port = parsed
		default:
			fmt.Fprintf(stderr, "argument inconnu : %s\n", argument)

			return 2
		}
	}

	if err := shots.Serve(dir, port); err != nil {
		fmt.Fprintln(stderr, err)

		return 1
	}

	return 0
}
