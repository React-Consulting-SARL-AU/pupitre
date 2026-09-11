package devcli_test

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/i18n"
)

// The usage is the grammar read aloud: a verb the app completes and the terminal never names would be a verb nobody can type.
func TestUsageNamesEveryVerbInBothLanguages(t *testing.T) {
	held := i18n.Current()
	t.Cleanup(func() { i18n.Use(string(held)) })

	for locale, first := range map[i18n.Locale]string{i18n.EN: "usage: pupitred dev", i18n.FR: "usage : pupitred dev"} {
		i18n.Use(string(locale))
		usage := devcli.Usage()

		if !strings.HasPrefix(usage, first) {
			t.Fatalf("%s: %q", locale, strings.SplitN(usage, "\n", 2)[0])
		}

		for _, verb := range devcli.Grammar() {
			if !strings.Contains(usage, "\n  "+verb.Name+" ") {
				t.Errorf("%s: the usage does not name %s", locale, verb.Name)
			}

			if !strings.Contains(usage, verb.Help) {
				t.Errorf("%s: %s is described as %q, which the usage does not carry", locale, verb.Name, verb.Help)
			}
		}
	}
}
