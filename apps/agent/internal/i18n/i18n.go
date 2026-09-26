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

type Message struct {
	FR string
	EN string
}

// One serve process answers one SSH session, which lets the locale live at the package level.
var current atomic.Value

func init() {
	current.Store(Default)

	parts := []map[string]Message{
		moduleCatalog, selfupdateCatalog, probeCatalog, hardenCatalog, engineCatalog, stateCatalog, commandCatalog,
		cliCatalog, warningCatalog, validateCatalog, registryCatalog, fieldCatalog, hintCatalog, filesCatalog,
		migrateCatalog, loginCatalog, backupCatalog, keysCatalog, sudoCatalog, uninstallCatalog,
	}

	for _, part := range parts {
		for key, message := range part {
			catalog[key] = message
		}
	}
}

func Use(locale string) Locale {
	switch Locale(locale) {
	case FR:
		current.Store(FR)
	case EN:
		current.Store(EN)
	}

	return Current()
}

// `dev` is typed outside any hello, so the login shell's LANG and LC_*, which ssh forwards, name the language.
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

func Known(locale string) bool {
	return Locale(locale) == FR || Locale(locale) == EN
}

// An unknown key renders as the key itself: a strange message beats an empty field.
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
