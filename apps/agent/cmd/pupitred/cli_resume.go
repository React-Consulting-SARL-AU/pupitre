package main

import (
	"fmt"
	"io"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/state"
)

// The boot's own command, run by pupitre-resume.service: what was up comes back, and the names of what started are the whole of its output.
//
// A configuration this binary does not read is left as it is, record included: a registry read the wrong way would empty it.
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
