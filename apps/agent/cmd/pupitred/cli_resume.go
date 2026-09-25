package main

import (
	"fmt"
	"io"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/state"
)

// A configuration this binary does not read is left untouched: a registry read the wrong way would be emptied.
func runResume(reader *state.Reader, config contract.ConfigRevision, stdout io.Writer) int {
	if !config.Current() {
		return 0
	}

	started := reader.Resume()

	if len(started) > 0 {
		fmt.Fprintln(stdout, strings.Join(started, "\n"))
	}

	return 0
}
