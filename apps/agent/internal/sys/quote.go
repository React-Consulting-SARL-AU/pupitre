package sys

import "strings"

// One word for a POSIX shell, whatever it holds.
func ShellQuote(word string) string {
	return "'" + strings.ReplaceAll(word, "'", `'\''`) + "'"
}
