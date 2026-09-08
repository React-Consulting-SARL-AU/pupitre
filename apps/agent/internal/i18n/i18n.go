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

	for _, part := range []map[string]Message{moduleCatalog, selfupdateCatalog, probeCatalog, hardenCatalog, engineCatalog, stateCatalog, commandCatalog, warningCatalog, validateCatalog, registryCatalog, fieldCatalog, hintCatalog} {
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

// In renders the phrase in a given locale, without touching the session's own.
func In(locale Locale, key string, args ...any) string {
	held := Current()
	defer current.Store(held)

	current.Store(locale)

	return T(key, args...)
}
