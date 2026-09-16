package state_test

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/registry"
)

/*
What was up when the machine went down comes back with it: the windows a start
opened are recorded, a stop or a removal forgets them, and the daemon replays
the record once, when the tmux session is gone with the boot.
*/

func wanted(t *testing.T, files map[string][]byte) string {
	t.Helper()

	return strings.TrimSpace(string(files[registry.DefaultRunning]))
}

func TestUpRecordsTheWindowAndDownForgetsIt(t *testing.T) {
	fake, reader := fixture(t)

	if _, err := reader.Up("web", ""); err != nil {
		t.Fatal(err)
	}
	if got := wanted(t, fake.Files); !strings.Contains(got, `"web/web"`) {
		t.Fatalf("a started window is recorded, got %q", got)
	}

	if _, err := reader.Down("web", ""); err != nil {
		t.Fatal(err)
	}
	if got := wanted(t, fake.Files); strings.Contains(got, "web/web") {
		t.Fatalf("a stopped window is forgotten, got %q", got)
	}
}

func TestDownForgetsAWindowThatIsNotOpen(t *testing.T) {
	fake, reader := fixture(t)
	fake.Files[registry.DefaultRunning] = []byte(`{"windows":["web/web"]}`)

	if _, err := reader.Down("web", ""); err != nil {
		t.Fatal(err)
	}
	if got := wanted(t, fake.Files); strings.Contains(got, "web/web") {
		t.Fatalf("the wish to run goes with the stop, window or not: %q", got)
	}
}

func TestRemoveForgetsTheProjectsWindows(t *testing.T) {
	fake, reader := fixture(t)
	fake.Dirs["/home/dev/projects/api"] = true

	if _, err := reader.Add(declared("api", 5173, "bun run dev --port 5173")); err != nil {
		t.Fatal(err)
	}
	if _, err := reader.Up("api", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := reader.Remove("api"); err != nil {
		t.Fatal(err)
	}

	if got := wanted(t, fake.Files); strings.Contains(got, "api/") {
		t.Fatalf("a removed project has nothing to resume: %q", got)
	}
}

func TestResumeStartsTheRecordedWindowsWhenTheSessionIsGone(t *testing.T) {
	fake, reader := fixture(t)
	fake.Files[registry.DefaultRunning] = []byte(`{"windows":["web/web","ghost/app","shots/shots"]}`)

	started := reader.Resume()

	if strings.Join(started, " ") != "web/web" {
		t.Fatalf("only a declared, non-service window is resumed: %v", started)
	}
	if got := projectOf(t, reader.Snapshot().Projects, "web"); got.State != contract.ProjectOnline {
		t.Fatalf("the project must be up again: %+v", got)
	}
	if got := wanted(t, fake.Files); strings.Contains(got, "ghost") {
		t.Fatalf("a window nobody declares any more is dropped from the record: %q", got)
	}
}

func TestResumeLeavesALiveSessionAlone(t *testing.T) {
	fake, reader := fixture(t)

	if _, err := reader.Up("web", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := reader.Down("web", ""); err != nil {
		t.Fatal(err)
	}
	fake.Files[registry.DefaultRunning] = []byte(`{"windows":["web/web"]}`)

	if started := reader.Resume(); len(started) != 0 {
		t.Fatalf("the session outlived the daemon: nothing is a boot, got %v", started)
	}
	if got := projectOf(t, reader.Snapshot().Projects, "web"); got.State != contract.ProjectStopped {
		t.Fatalf("nothing must have been started: %+v", got)
	}
}
