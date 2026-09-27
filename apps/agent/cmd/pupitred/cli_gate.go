package main

import (
	"fmt"
	"io"
	"strings"

	"pupitre.studio/agent/internal/gate"
	"pupitre.studio/agent/internal/i18n"
)

const gateCommand = "gate"

// Run by the pupitre-gate unit; the exposure sends it every public name of the server.
func runGate(args []string, stderr io.Writer) int {
	dir, listen := gate.Dir, gate.Address

	for _, argument := range args {
		switch {
		case strings.HasPrefix(argument, "--dir="):
			dir = strings.TrimPrefix(argument, "--dir=")
		case strings.HasPrefix(argument, "--listen="):
			listen = strings.TrimPrefix(argument, "--listen=")
		default:
			fmt.Fprintln(stderr, i18n.T("cli.argument.unknown", argument))

			return 2
		}
	}

	logf := func(format string, args ...any) { fmt.Fprintf(stderr, format+"\n", args...) }

	if err := gate.Serve(dir, listen, logf); err != nil {
		fmt.Fprintln(stderr, err)

		return 1
	}

	return 0
}
