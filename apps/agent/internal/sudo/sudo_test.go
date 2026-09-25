package sudo

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules/modtest"
)

func TestTheStateIsReadOffTheRuleOnDisk(t *testing.T) {
	cases := map[string]struct {
		file    string
		present bool
		want    contract.SudoState
	}{
		"every server before decision 0015": {file: Open, present: true, want: contract.SudoNopasswdAll},
		"a password accepted":               {file: Restricted, present: true, want: contract.SudoPassword},
		"a rule nobody at Pupitre wrote":    {file: "dev ALL=(ALL) ALL\n", present: true, want: ""},
		"pupitred with any argument":        {file: "dev ALL=(ALL:ALL) ALL\ndev ALL=(root) NOPASSWD: /usr/local/bin/pupitred\n", present: true, want: ""},
		"no rule at all":                    {want: ""},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			fake := modtest.NewFakeSys()
			if tc.present {
				fake.Files[Path] = []byte(tc.file)
			}

			if got := State(modtest.NewContext(t, fake, modtest.Options{})); got != tc.want {
				t.Fatalf("State = %q, want %q", got, tc.want)
			}
		})
	}
}

// sudo applies the last rule that matches: pupitred's own has to come after the one that asks for the password.
func TestTheRestrictedRuleLetsPupitredThroughLast(t *testing.T) {
	lines := strings.Split(strings.TrimSpace(Restricted), "\n")

	if len(lines) != 2 || lines[0] != "dev ALL=(ALL:ALL) ALL" || !strings.HasPrefix(lines[1], "dev ALL=(root) NOPASSWD: ") {
		t.Fatalf("rule = %q", Restricted)
	}
}

// A command listed with arguments matches those arguments exactly, and a wildcard would match a space too: the rule names
// the two lines the app runs without the password, with no wildcard, so --privileged and every other subcommand fall to it.
func TestTheRestrictedRuleNamesExactCommandLines(t *testing.T) {
	_, commands, _ := strings.Cut(strings.Split(strings.TrimSpace(Restricted), "\n")[1], "NOPASSWD: ")

	listed := strings.Split(commands, ", ")
	want := []string{"/usr/local/bin/pupitred serve", "/usr/local/bin/pupitred binary install"}

	if strings.Join(listed, "|") != strings.Join(want, "|") {
		t.Fatalf("commands = %q, want %q", listed, want)
	}

	if strings.ContainsAny(commands, `*?[]\"`) {
		t.Fatalf("the rule holds a pattern: %q", commands)
	}
}
