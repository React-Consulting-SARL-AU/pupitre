// Package golden records what a transcript run actually produced, instead of failing on it.
//
// A harness asks Updating whether a divergence is a failure or a recording, and
// calls Rewrite to put the run's own output back into the file. Only the "< "
// lines are touched: requests, secret lines, directives, comments and blank
// lines are copied as they stand, in the order the file holds them.
package golden

import (
	"os"
	"strings"
)

const variable = "UPDATE_GOLDEN"

func Updating() bool {
	return os.Getenv(variable) == "1"
}

func Rewrite(path string, outputs []string) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	lines := strings.Split(strings.TrimSuffix(string(raw), "\n"), "\n")

	rewritten := make([]string, 0, len(lines)+len(outputs))
	written, last := 0, -1

	for _, line := range lines {
		if !strings.HasPrefix(line, "< ") {
			rewritten = append(rewritten, line)
			continue
		}

		if written < len(outputs) {
			rewritten = append(rewritten, "< "+outputs[written])
			written++
			last = len(rewritten) - 1
		}
	}

	rewritten = insert(rewritten, last+1, outputs[written:])

	return os.WriteFile(path, []byte(strings.Join(rewritten, "\n")+"\n"), info.Mode().Perm())
}

func insert(lines []string, at int, outputs []string) []string {
	if len(outputs) == 0 {
		return lines
	}

	if at <= 0 || at > len(lines) {
		at = len(lines)
	}

	added := make([]string, 0, len(outputs))
	for _, output := range outputs {
		added = append(added, "< "+output)
	}

	tail := append([]string{}, lines[at:]...)

	return append(append(lines[:at:at], added...), tail...)
}
