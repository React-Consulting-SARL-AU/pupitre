//go:build staging

package staging

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
)

// The escape sequences a terminal reads to know where a command starts and ends; a shell that emits none leaves the app guessing from the screen.
var markers = []string{"\x1b]133;A", "\x1b]133;B", "\x1b]133;C", "\x1b]133;D", "\x1b]7;file://"}

func TestShellsEmitThePromptMarkers(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	for _, shell := range []string{"zsh", "bash"} {
		out := ssh(t, dev, shell, "-ic", "true")
		for _, marker := range markers {
			if !strings.Contains(out, marker) {
				t.Errorf("%s emits no %q: %q", shell, marker, out)
			}
		}
	}
}

func TestDevDrivesTheMachineFromASSHCommand(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	for _, argv := range [][]string{{"pupitred", "dev", "status"}, {"dev", "status"}} {
		if out := ssh(t, dev, argv...); strings.Contains(out, "usage") {
			t.Fatalf("%s answered with its usage: %q", strings.Join(argv, " "), out)
		}
	}

	if out := ssh(t, dev, "dev", "doctor", "--json"); !strings.Contains(out, `"checks"`) {
		t.Fatalf("dev doctor --json must print the protocol answer: %q", out)
	}
}

func TestCompletionsDescribeTheMachineWithoutLeavingTheProjectsRoot(t *testing.T) {
	host := stagingHost(t)

	answers := agent(t, host,
		request{Cmd: "completions"},
		request{Cmd: "completions", Params: map[string]any{"path": "."}},
	)

	completions := decode[contract.Completions](t, answers[0].Result)
	if completions.Command != "dev" || len(completions.Sub) == 0 || completions.Root == "" {
		t.Fatalf("unexpected completions: %+v", completions)
	}

	refused := attempt(t, host, request{Cmd: "completions", Params: map[string]any{"path": "../../etc"}})[0]
	if refused.OK || !strings.Contains(string(refused.Error), "bad_request") {
		t.Fatalf("a path out of the projects root must be refused: %s", refused.Error)
	}
}
