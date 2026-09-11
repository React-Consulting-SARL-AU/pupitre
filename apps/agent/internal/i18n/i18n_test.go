package i18n

import (
	"strings"
	"testing"
)

func TestTheTwoLanguagesHaveTheSameKeysAndNoneIsEmpty(t *testing.T) {
	for key, message := range catalog {
		if strings.TrimSpace(message.FR) == "" {
			t.Errorf("%s: the French phrase is empty", key)
		}

		if strings.TrimSpace(message.EN) == "" {
			t.Errorf("%s: the English phrase is empty", key)
		}
	}
}

// TestNoFrenchAccentSurvivesInEnglish: an English phrase carrying a French accent is a forgotten translation.
func TestNoFrenchAccentSurvivesInEnglish(t *testing.T) {
	for key, message := range catalog {
		if strings.ContainsAny(message.EN, "éèêëàâçùûîïôœÉÈÊÀÇÙÔ") {
			t.Errorf("%s: the English phrase carries a French accent: %s", key, message.EN)
		}
	}
}

func TestTheSessionLanguageDecides(t *testing.T) {
	defer Use(string(Default))

	catalog["test.greeting"] = Message{FR: "Bonjour", EN: "Hello"}
	defer delete(catalog, "test.greeting")

	if Use("fr"); T("test.greeting") != "Bonjour" {
		t.Fatalf("fr = %q", T("test.greeting"))
	}

	if Use("en"); T("test.greeting") != "Hello" {
		t.Fatalf("en = %q", T("test.greeting"))
	}
}

// TestAnUnknownLanguageChangesNothing: a locale the product does not serve leaves the session in the one it had.
func TestAnUnknownLanguageChangesNothing(t *testing.T) {
	defer Use(string(Default))

	Use("en")

	if Use("de") != EN {
		t.Fatalf("langue courante = %q", Current())
	}

	if Known("de") {
		t.Fatal("de is not a language the product serves")
	}
}

func TestAnUnknownKeyRendersItself(t *testing.T) {
	if T("clé.inconnue") != "clé.inconnue" {
		t.Fatalf("unknown key = %q", T("clé.inconnue"))
	}
}

func TestArgumentsAreFilledIn(t *testing.T) {
	catalog["test.count"] = Message{FR: "%d fichiers", EN: "%d files"}
	defer delete(catalog, "test.count")
	defer Use(string(Default))

	Use("en")

	if T("test.count", 3) != "3 files" {
		t.Fatalf("= %q", T("test.count", 3))
	}
}

// TestAnEnglishSessionCarriesNoFrenchAccent: a session opened in English returns no French accent, catalogue included.
func TestAnEnglishSessionCarriesNoFrenchAccent(t *testing.T) {
	defer Use(string(Default))

	Use("en")

	for key := range catalog {
		if strings.ContainsAny(T(key), "éèêëàâçùûîïôœÉÈÊÀÇÙÔ") {
			t.Errorf("%s: French accent in an English session — %s", key, T(key))
		}
	}
}

// A shell states its language the way every Unix tool reads it, and ssh forwards LANG and LC_* on its own.
func TestTheLocaleComesFromTheReadersShell(t *testing.T) {
	defer Use(string(Default))

	cases := []struct {
		env    map[string]string
		locale Locale
	}{
		{env: map[string]string{"LANG": "fr_FR.UTF-8"}, locale: FR},
		{env: map[string]string{"LC_ALL": "fr_FR.UTF-8", "LANG": "en_US.UTF-8"}, locale: FR},
		{env: map[string]string{"PUPITRE_LOCALE": "en", "LC_ALL": "fr_FR.UTF-8"}, locale: EN},
		{env: map[string]string{"LANG": "C.UTF-8"}, locale: Default},
		{env: map[string]string{"LANG": "de_DE.UTF-8"}, locale: Default},
		{env: nil, locale: Default},
	}

	for _, held := range cases {
		Use(string(Default))

		if got := FromEnv(func(name string) string { return held.env[name] }); got != held.locale {
			t.Errorf("%v: %q, expected %q", held.env, got, held.locale)
		}
	}
}
