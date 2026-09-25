// Package i18n holds every phrase the agent shows, in the languages the product serves.
//
// The server is the source of truth for what concerns it: the app displays
// what it answers, with no translation table of its own. It states its
// locale in `hello`, and the agent answers in that locale when it knows it —
// in its own otherwise, never an error or an empty field.
//
// One process serves one session: `pupitred serve` runs behind a single
// client's SSH session, which lets the locale live at the package level
// instead of threading through three hundred signatures.
package i18n

import (
	"fmt"
	"strings"
	"sync/atomic"
)

type Locale string

const (
	FR      Locale = "fr"
	EN      Locale = "en"
	Default        = EN
)

// Message carries the same phrase in both languages. Neither may be empty.
type Message struct {
	FR string
	EN string
}

var current atomic.Value

func init() {
	current.Store(Default)

	for _, part := range []map[string]Message{moduleCatalog, selfupdateCatalog, probeCatalog, hardenCatalog, engineCatalog, stateCatalog, commandCatalog, cliCatalog, warningCatalog, validateCatalog, registryCatalog, fieldCatalog, hintCatalog, filesCatalog, migrateCatalog, loginCatalog, backupCatalog, keysCatalog, sudoCatalog} {
		for key, message := range part {
			catalog[key] = message
		}
	}
}

// Use remembers the session's locale. An unknown locale leaves the previous one in place.
func Use(locale string) Locale {
	switch Locale(locale) {
	case FR:
		current.Store(FR)
	case EN:
		current.Store(EN)
	}

	return Current()
}

// FromEnv is the locale a login shell states. `dev` is typed outside any
// protocol session, so no `hello` has named a language by then; ssh forwards
// LANG and LC_* by default, which leaves the reader's own shell as the one
// thing that knows. A machine that would rather pin it sets PUPITRE_LOCALE.
func FromEnv(getenv func(string) string) Locale {
	for _, name := range []string{"PUPITRE_LOCALE", "LC_ALL", "LC_MESSAGES", "LANG"} {
		if language := languageOf(getenv(name)); Known(language) {
			return Use(language)
		}
	}

	return Current()
}

// fr_FR.UTF-8 is French; C and POSIX name no language at all.
func languageOf(value string) string {
	value, _, _ = strings.Cut(value, ".")
	value, _, _ = strings.Cut(value, "_")

	return strings.ToLower(value)
}

func Current() Locale {
	held, _ := current.Load().(Locale)
	if held == "" {
		return Default
	}

	return held
}

// Known reports whether the product serves this locale, without remembering it.
func Known(locale string) bool {
	return Locale(locale) == FR || Locale(locale) == EN
}

// T renders the phrase for the key in the session's locale. An unknown key renders as the key itself: a strange message beats an empty field.
func T(key string, args ...any) string {
	message, known := catalog[key]
	if !known {
		return key
	}

	text := message.FR
	if Current() == EN {
		text = message.EN
	}

	if len(args) == 0 {
		return text
	}

	return fmt.Sprintf(text, args...)
}

// Count renders one of two phrases and fills the count in. French turns plural past one, English at anything but one.
func Count(count int, one, many string) string {
	turns := count > 1
	if Current() == EN {
		turns = count != 1
	}

	if turns {
		return T(many, count)
	}

	return T(one, count)
}
