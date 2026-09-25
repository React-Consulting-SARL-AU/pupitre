package state_test

import (
	"encoding/json"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/state"
)

func TestRemoveRefusesAVersionedProjectBeforeStoppingIt(t *testing.T) {
	fake, reader := fixture(t)

	if _, err := reader.Up("web", ""); err != nil {
		t.Fatal(err)
	}

	_, err := reader.Remove("web")
	if code(t, err) != contract.ErrorBadRequest {
		t.Fatalf("a versioned project is refused, got %v", err)
	}

	if _, open := fake.Windows["web/web"]; !open {
		t.Fatalf("the refusal must come before the stop: %v", fake.Mutations)
	}
}

func TestAddSaysWhatFailedAfterTheRowWasWritten(t *testing.T) {
	fake, reader := published(t)
	fake.Files["/home/dev/.local/bin/mise"] = []byte("mise")
	fake.Tools["node"] = "24"
	fake.Versions["node"] = []string{"22.19.0"}
	fake.Dirs["/home/dev/projects/shop"] = true
	fake.Refuse("mise trust", "mise: trust refused")

	project := turbo()
	project.Runtimes = map[string]string{"node": "22"}

	added, err := reader.Add(project, running("bun run dev --port 3100"))
	if err != nil {
		t.Fatalf("a pin that fails after the row is a warning, not a refusal: %v", err)
	}

	if len(added.Warnings) != 1 || !strings.Contains(added.Warnings[0], "mise") {
		t.Fatalf("the warning names what failed: %+v", added.Warnings)
	}

	if _, declared := reader.List(), false; declared || len(reader.List()) != 3 {
		t.Fatalf("the row is written: %+v", reader.List())
	}

	encoded, err := json.Marshal(added)
	if err != nil || !strings.Contains(string(encoded), `"warnings":["`) {
		t.Fatalf("the warnings travel with the answer: %s, %v", encoded, err)
	}
}

func TestAddRefusesAProcessFolderThatIsAFileBeforeWriting(t *testing.T) {
	fake, reader := published(t)
	fake.Files["/home/dev/projects/shop"] = []byte("not a folder")

	_, err := reader.Add(turbo(), running("bun run dev --port 3100"))
	if code(t, err) != contract.ErrorBadRequest {
		t.Fatalf("got %v", err)
	}

	if len(reader.List()) != 2 {
		t.Fatalf("nothing must have been declared: %+v", reader.List())
	}
}

func TestUpdateLeavesTheProcessStoppedWhenTheNewCommandRefusesToStart(t *testing.T) {
	fake, reader := published(t)
	fake.Serves("shop/shop", 3100)

	if _, err := reader.Add(turbo(), running("bun run turbo run dev")); err != nil {
		t.Fatal(err)
	}
	if _, err := reader.Up("shop", ""); err != nil {
		t.Fatal(err)
	}

	moved := []state.ProcessRequest{{ID: "shop", Dir: "apps/web", PkgMgr: "bun", Host: "127.0.0.1", Port: 3100, Cmd: "bun run dev --port 3100", Routes: []registry.RouteRequest{}}}
	updated, err := reader.Update("shop", state.UpdatePatch{Processes: &moved})
	if err != nil {
		t.Fatalf("a start that refuses after the row is a warning, not a refusal: %v", err)
	}

	if _, open := fake.Windows["shop/shop"]; open {
		t.Fatal("the old process must have been stopped")
	}
	if updated.State != contract.ProjectStopped || len(updated.Warnings) != 1 || !strings.Contains(updated.Warnings[0], "shop/shop") {
		t.Fatalf("the process is left stopped, and the answer says so: %+v", updated)
	}
	if processOf(t, updated.Project, "shop").Dir != "apps/web" {
		t.Fatalf("the row took the new folder: %+v", updated.Project)
	}
}

func TestUpdateClosesADeadPaneOfAProcessThatLeaves(t *testing.T) {
	fake, reader := published(t)
	fake.Serves("shop/shop", 3100)
	fake.Serves("shop/mail", 3105)
	fake.Dirs["/home/dev/projects/shop/apps/mail"] = true

	mail := state.ProcessRequest{ID: "mail", Dir: "apps/mail", PkgMgr: "bun", Host: "127.0.0.1", Port: 3105, Cmd: "bun run dev --port 3105"}
	both := append(running("bun run turbo run dev"), mail)
	if _, err := reader.Add(turbo(), both); err != nil {
		t.Fatal(err)
	}
	if _, err := reader.Up("shop", ""); err != nil {
		t.Fatal(err)
	}

	fake.Dies("shop/mail", 1)

	only := running("bun run turbo run dev")
	if _, err := reader.Update("shop", state.UpdatePatch{Processes: &only}); err != nil {
		t.Fatal(err)
	}

	if _, open := fake.Windows["shop/mail"]; open {
		t.Fatalf("the corpse must be closed: %v", fake.Mutations)
	}
	if record := string(fake.Files[registry.DefaultRunning]); strings.Contains(record, "shop/mail") {
		t.Fatalf("the record must forget it:\n%s", record)
	}
}

func TestAnUnreadableRegistryIsSaidAndNeverRewritten(t *testing.T) {
	fake, reader := fixture(t)
	fake.Files[registry.DefaultLocal] = []byte("{ broken\n")

	if _, err := reader.Add(declared("api", 5173, "bun run dev")); code(t, err) != contract.ErrorBadRequest {
		t.Fatalf("project.add: %v", err)
	}
	if _, err := reader.Up("web", ""); code(t, err) != contract.ErrorBadRequest {
		t.Fatalf("project.up: %v", err)
	}
	if _, err := reader.Remove("web"); code(t, err) != contract.ErrorBadRequest {
		t.Fatalf("project.remove: %v", err)
	}
	if _, err := reader.Logs("web", "web", 10); code(t, err) != contract.ErrorBadRequest {
		t.Fatalf("project.logs: %v", err)
	}
	if _, err := reader.Declared(); code(t, err) != contract.ErrorBadRequest {
		t.Fatalf("project.list: %v", err)
	}

	if string(fake.Files[registry.DefaultLocal]) != "{ broken\n" {
		t.Fatalf("the file was rewritten:\n%s", fake.Files[registry.DefaultLocal])
	}

	if snapshot := reader.Snapshot(); len(snapshot.Projects) != 2 {
		t.Fatalf("the snapshot still shows the repository's rows: %+v", snapshot.Projects)
	}
}
