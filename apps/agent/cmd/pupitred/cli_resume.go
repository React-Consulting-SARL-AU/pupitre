package main

import (
	"fmt"
	"io"
	"strings"

	"pupitre.studio/agent/internal/state"
)

// The boot's own command, run by pupitre-resume.service: what was up comes back, and the names of what started are the whole of its output.
func runResume(reader *state.Reader, stdout io.Writer) int {
	started := reader.Resume()

	if len(started) > 0 {
		fmt.Fprintln(stdout, strings.Join(started, "\n"))
	}

	return 0
}
