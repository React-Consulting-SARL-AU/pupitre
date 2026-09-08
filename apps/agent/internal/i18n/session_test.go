package i18n_test

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	_ "pupitre.studio/agent/internal/modules/ai"
	_ "pupitre.studio/agent/internal/modules/core"
	_ "pupitre.studio/agent/internal/modules/db"
	_ "pupitre.studio/agent/internal/modules/editor"
	_ "pupitre.studio/agent/internal/modules/exposure"
	_ "pupitre.studio/agent/internal/modules/runtime"
	_ "pupitre.studio/agent/internal/modules/tool"
	"pupitre.studio/agent/internal/probe"
)

const accents = "éèêëàâçùûîïôœÉÈÊÀÇÙÔ"

// TestTheCatalogueAnswersInTheLanguageOfTheSession: the catalogue the app receives is the session's own — nothing stays written in French when it asks for English.
func TestTheCatalogueAnswersInTheLanguageOfTheSession(t *testing.T) {
	defer i18n.Use(string(i18n.Default))

	i18n.Use("en")

	for _, module := range modules.Default().All() {
		manifest := module.Manifest()

		if strings.ContainsAny(manifest.Summary, accents) {
			t.Errorf("%s: French summary in an English session — %s", manifest.ID, manifest.Summary)
		}

		for _, field := range manifest.Fields {
			if strings.ContainsAny(field.Label+field.Help, accents) {
				t.Errorf("%s.%s: French label in an English session", manifest.ID, field.Key)
			}
		}
	}
}

// TestTheProbeVerdictFollowsTheSession: the probe says the same thing in both languages, and the French stays what it was.
func TestTheProbeVerdictFollowsTheSession(t *testing.T) {
	defer i18n.Use(string(i18n.Default))

	machine := probe.Machine{OS: "debian", Version: "12", Arch: "amd64", RAMMB: 8192, Sudo: true}

	i18n.Use("fr")
	french := probe.Decide(machine)

	i18n.Use("en")
	english := probe.Decide(machine)

	if len(french.Reasons) == 0 || len(english.Reasons) != len(french.Reasons) {
		t.Fatalf("raisons : %v / %v", french.Reasons, english.Reasons)
	}

	if strings.Join(french.Reasons, " ") == strings.Join(english.Reasons, " ") {
		t.Fatalf("both languages render the same phrase: %v", french.Reasons)
	}

	if !strings.Contains(strings.Join(french.Reasons, " "), "Distribution non prise en charge") {
		t.Fatalf("the French verdict must stay French: %v", french.Reasons)
	}

	if strings.ContainsAny(strings.Join(english.Reasons, " ")+strings.Join(english.Fixes, " "), accents) {
		t.Fatalf("accented English verdict: %v %v", english.Reasons, english.Fixes)
	}
}
