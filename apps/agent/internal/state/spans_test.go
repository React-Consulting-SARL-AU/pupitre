package state_test

import (
	"slices"
	"testing"

	"pupitre.studio/agent/internal/contract"
)

func TestASpanReachesTheProcessAndKeepsOtherProjectsOut(t *testing.T) {
	fake, reader := gateway(t)

	project, processes := declared("box", 3300, "bun run dev")
	processes[0].PortSpan = 10

	added, err := reader.Add(project, processes)
	if err != nil {
		t.Fatal(err)
	}

	if added.Processes[0].PortSpan != 10 {
		t.Fatalf("the span must come back: %+v", added.Processes[0])
	}

	fake.Dirs["/home/dev/projects/box"] = true

	if _, err := reader.Up("box", ""); err != nil {
		t.Fatal(err)
	}

	given := windowEnvironment(t, fake, "box/box")
	for _, want := range []string{"PUPITRE_PORT=3300", "PUPITRE_PORT_LAST=3309", "PUPITRE_PORT_RANGE=3300-3309", "PUPITRE_PROCESS_BOX_PORT_RANGE=3300-3309"} {
		if !slices.Contains(given, want) {
			t.Errorf("the window lacks %s: %q", want, given)
		}
	}

	other, inside := declared("other", 3305, "bun run dev")

	_, err = reader.Add(other, inside)
	if codeOf(err) != contract.ErrorBadRequest {
		t.Fatalf("a port inside box's span must be refused, got %v", err)
	}
}

func TestTheSnapshotNamesTheWindowHoldingAProcessPort(t *testing.T) {
	_, reader := gateway(t)

	if _, err := reader.Up("react", ""); err != nil {
		t.Fatal(err)
	}

	projects := reader.Snapshot().Projects

	if got := processOf(t, projectOf(t, projects, "intranet"), "intranet").HeldBy; got != "react/react" {
		t.Fatalf("held_by = %q, want react/react", got)
	}

	if got := processOf(t, projectOf(t, projects, "react"), "react").HeldBy; got != "" {
		t.Fatalf("a process holding its own port is held by nobody, got %q", got)
	}

	if got := processOf(t, projectOf(t, projects, "react"), "react").PortSpan; got != 1 {
		t.Fatalf("a row that names no span holds one port, got %d", got)
	}
}
