package state

import (
	"path"
	"regexp"
	"slices"
	"strings"
)

const redacted = "[secret]"

// A word naming a secret: what follows it, as the next word or after its =, is the secret itself.
var secretWord = regexp.MustCompile(`(?i)(pass(word|wd)?|secret|token|api[-_]?key|access[-_]?key|private[-_]?key|(^|[-_])key$|auth|credentials?)`)

// Userinfo of an address: postgres://app:S3cret@localhost/shop.
var userinfo = regexp.MustCompile(`(://[^/:@\s]*:)[^@\s]+@`)

// The programs whose -p carries the password glued to it: mysql -pS3cret.
var gluedPassword = []string{"mysql", "mysqldump", "mysqladmin", "mariadb", "mariadb-dump", "mariadb-admin"}

// redactCommand keeps what a command line says of the program and drops the values its arguments carry for a secret, so a diagnostic that travels to support carries none.
func redactCommand(line string) string {
	words := strings.Fields(line)
	if len(words) == 0 {
		return line
	}

	glued := slices.Contains(gluedPassword, path.Base(words[0]))
	hideNext := false

	for i, word := range words {
		if hideNext && !strings.HasPrefix(word, "-") {
			words[i] = redacted
			hideNext = false

			continue
		}

		hideNext = false
		words[i] = userinfo.ReplaceAllString(word, "${1}"+redacted+"@")

		switch name, value, assigned := strings.Cut(word, "="); {
		case assigned && value != "" && secretWord.MatchString(name):
			words[i] = name + "=" + redacted
		case glued && len(word) > 2 && strings.HasPrefix(word, "-p") && !strings.HasPrefix(word, "--"):
			words[i] = "-p" + redacted
		case !assigned && (word == "-p" || strings.EqualFold(word, "bearer") || (strings.HasPrefix(word, "-") && secretWord.MatchString(word))):
			hideNext = true
		}
	}

	return strings.Join(words, " ")
}
