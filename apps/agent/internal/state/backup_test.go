package state_test

import (
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/registry"
)

func TestWhatATreeHoldsIsReadWithoutFetching(t *testing.T) {
	fake, reader := fixture(t)
	fake.Answer("rev-parse --show-toplevel", "/home/dev/projects/web\n\n")
	fake.Answer("rev-parse --abbrev-ref HEAD", "feature/login\n")
	fake.Answer("status --porcelain", " M a.ts\n?? b.ts\n")
	fake.Answer("rev-list --count HEAD --not --remotes", "3\n")

	held, found := reader.Held("web")
	if !found || held.Branch != "feature/login" || held.Dirty != 2 || held.Ahead != 3 || held.Repo != "https://github.com/me/web" {
		t.Fatalf("held = %+v, %v", held, found)
	}

	if strings.Contains(strings.Join(fake.Commands(), "\n"), "fetch") {
		t.Fatal("a backup reads the machine, never the network")
	}
}

func TestTheProjectsWantedUpAreTheRecordsOnce(t *testing.T) {
	fake, reader := fixture(t)
	fake.Files[registry.DefaultRunning] = []byte(`{"windows":["web/web","web/worker","shots/shots","stray"]}`)

	if wanted := reader.Wanted(); !slices.Equal(wanted, []string{"web", "shots"}) {
		t.Fatalf("wanted = %v", wanted)
	}
}

func TestARestoredRegistryGetsItsLocalNamesAndItsPins(t *testing.T) {
	fake, reader := fixture(t)
	fake.Files[registry.DefaultLocal] = []byte(`{"projects":[{"name":"box","dir":"box","boot":false,"runtimes":{"node":"22"},"processes":[{"id":"app","dir":".","pkgmgr":"bun","host":"box.localhost","port":3100,"routes":[],"cmd":"bun run dev"}]}]}`)

	if err := reader.SyncHosts(); err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(string(fake.Files["/etc/hosts"]), "127.0.0.1 box.localhost") {
		t.Fatalf("hosts = %s", fake.Files["/etc/hosts"])
	}

	if err := reader.PinRuntimes("box"); err != nil {
		t.Fatalf("a folder not there yet gets its pins with its clone: %v", err)
	}

	if err := reader.PinRuntimes("ghost"); err == nil {
		t.Fatal("a project the registry does not hold has nothing to pin")
	}
}
