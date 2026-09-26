package state_test

import (
	"encoding/json"
	"slices"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/state"
	"pupitre.studio/agent/internal/sys/env"
)

const environmentPath = "/home/dev/" + registry.EnvironmentFile

func windowEnvironment(t *testing.T, fake *modtest.FakeSys, window string) []string {
	t.Helper()

	var pairs []string

	for _, call := range fake.Calls {
		if len(call.Argv) < 2 || call.Argv[1] != "new-window" || !slices.Contains(call.Argv, window) {
			continue
		}

		pairs = nil

		for at, arg := range call.Argv {
			if arg == "-e" && at+1 < len(call.Argv) {
				pairs = append(pairs, call.Argv[at+1])
			}
		}
	}

	return pairs
}

func webChanged(t *testing.T, reader *state.Reader) bool {
	t.Helper()

	for _, project := range reader.Snapshot().Projects {
		if project.Name == "web" {
			return processOf(t, project, "web").EnvChanged
		}
	}

	t.Fatal("web missing from the snapshot")

	return false
}

func TestAProcessStartsWithItsEnvironmentAndSaysWhenTheRegistryMovesOn(t *testing.T) {
	fake, reader := fixture(t)

	if _, err := reader.Up("web", ""); err != nil {
		t.Fatal(err)
	}

	given := windowEnvironment(t, fake, "web/web")
	for _, want := range []string{"PUPITRE=1", "PUPITRE_PROJECT=web", "PUPITRE_PROCESS=web", "PUPITRE_PORT=3000", "PUPITRE_URL=http://127.0.0.1:3000"} {
		if !slices.Contains(given, want) {
			t.Errorf("the window lacks %s: %q", want, given)
		}
	}

	if webChanged(t, reader) {
		t.Fatal("a process started on today's registry has nothing to catch up on")
	}

	fake.Files[env.Path] = []byte(env.DomainKey + "=" + domain + "\n")

	if !webChanged(t, reader) {
		t.Fatal("a domain the process never received must ask for a restart")
	}

	if _, err := reader.Restart("web", ""); err != nil {
		t.Fatal(err)
	}

	if !slices.Contains(windowEnvironment(t, fake, "web/web"), "PUPITRE_DOMAIN="+domain) || webChanged(t, reader) {
		t.Fatal("a restart hands the new environment over")
	}
}

func TestAWindowOpenedBeforeTheFingerprintNeverAsksForARestart(t *testing.T) {
	fake, reader := fixture(t)

	if _, err := reader.Up("web", ""); err != nil {
		t.Fatal(err)
	}

	delete(fake.WindowEnv, "web/web")
	fake.Files[env.Path] = []byte(env.DomainKey + "=" + domain + "\n")

	if webChanged(t, reader) {
		t.Fatal("without a fingerprint, nothing says what the process received")
	}
}

func TestTheShellsFileFollowsTheRegistry(t *testing.T) {
	fake, reader := fixture(t)
	reader.Snapshot()

	var document registry.EnvironmentDocument
	if err := json.Unmarshal(fake.Files[environmentPath], &document); err != nil {
		t.Fatalf("%s: %v", environmentPath, err)
	}

	if !slices.Contains(document.At("/home/dev/projects/web/src"), "PUPITRE_PORT=3000") {
		t.Fatalf("the project's folder gets its process's variables: %+v", document)
	}

	if fake.Owners[environmentPath] != "dev:dev" {
		t.Fatalf("dev reads it: owned by %q", fake.Owners[environmentPath])
	}

	fake.Files[env.Path] = []byte(env.DomainKey + "=" + domain + "\n")
	reader.Snapshot()

	if err := json.Unmarshal(fake.Files[environmentPath], &document); err != nil || !slices.Contains(document.Machine, "PUPITRE_DOMAIN="+domain) {
		t.Fatalf("a domain set outside the registry reaches the file at the next read: %+v", document)
	}

	project, processes := declared("blog", 3400, "bun run dev")
	if _, err := reader.Add(project, processes); err != nil {
		t.Fatal(err)
	}

	if err := json.Unmarshal(fake.Files[environmentPath], &document); err != nil || !slices.Contains(document.At("/home/dev/projects/blog"), "PUPITRE_PORT=3400") {
		t.Fatalf("a declared project reaches the file with the write: %+v", document)
	}
}
