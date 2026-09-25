package state_test

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/state"
)

func monorepoFixture(t *testing.T) (*modtest.FakeSys, *state.Reader) {
	t.Helper()

	fake, reader := fixture(t)
	root := "/home/dev/projects/candidate"
	fake.Dirs[root] = true

	err := filepath.WalkDir("testdata/monorepo", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		relative, _ := filepath.Rel("testdata/monorepo", path)
		if entry.IsDir() {
			fake.Dirs[filepath.Join(root, relative)] = true

			return nil
		}

		raw, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		fake.Files[filepath.Join(root, relative)] = raw

		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	return fake, reader
}

func TestDetectReadsATurborepoAsOneProjectWithSeveralPorts(t *testing.T) {
	_, reader := monorepoFixture(t)

	whole, err := reader.Detect("", "candidate", "")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}

	if err := contract.ValidateValue("ProjectDetectResult", whole); err != nil {
		t.Fatalf("detection violates the contract: %v", err)
	}

	detected := only(t, whole)

	if detected.PkgMgr != "pnpm" || detected.Install != "pnpm install" || detected.Cmd != "pnpm exec turbo run dev" {
		t.Fatalf("unexpected detection: %+v", detected)
	}

	// One host per project: the first workspace freezing a .localhost name gives it, and only web does.
	if detected.HostHint != "atlas.localhost" {
		t.Fatalf("host hint = %q, want atlas.localhost", detected.HostHint)
	}

	// Folders come in name order; web's 3000 is held by the fixture's declared project, so 3003 is proposed.
	want := []contract.DetectedRoute{{Label: "api", Port: 3001}, {Label: "docs", Port: 3002}, {Label: "web", Port: 3003}}
	if len(detected.Routes) != len(want) {
		t.Fatalf("routes = %+v, want %+v", detected.Routes, want)
	}
	for at := range want {
		if detected.Routes[at] != want[at] {
			t.Fatalf("route %d = %+v, want %+v", at, detected.Routes[at], want[at])
		}
	}

	if detected.PortHint != 3001 {
		t.Fatalf("the main port is the first route's: %d", detected.PortHint)
	}
}

func TestDetectSkipsTheWorkspacesThatDoNotListen(t *testing.T) {
	_, reader := monorepoFixture(t)

	whole, err := reader.Detect("", "candidate", "")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}
	detected := only(t, whole)

	for _, route := range detected.Routes {
		if route.Label == "ui" {
			t.Fatalf("a package that builds and never listens is not a route: %+v", detected.Routes)
		}
	}
}

func TestDetectGivesEachWorkspaceItsOwnPort(t *testing.T) {
	fake, reader := monorepoFixture(t)
	fake.Files["/home/dev/projects/candidate/apps/api/package.json"] = []byte(`{"name":"@atlas/api","scripts":{"start":"node server.js -p 3002"}}`)

	whole, err := reader.Detect("", "candidate", "")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}
	detected := only(t, whole)

	ports := map[int]string{}

	for _, route := range detected.Routes {
		if holder, taken := ports[route.Port]; taken {
			t.Fatalf("%s and %s share port %d: %+v", holder, route.Label, route.Port, detected.Routes)
		}
		ports[route.Port] = route.Label
	}
}

func TestDetectReadsTheWorkspacesOfPnpm(t *testing.T) {
	fake, reader := monorepoFixture(t)
	fake.Files["/home/dev/projects/candidate/package.json"] = []byte(`{"name":"atlas","private":true,"scripts":{"dev":"turbo run dev"}}`)
	fake.Files["/home/dev/projects/candidate/pnpm-workspace.yaml"] = []byte("packages:\n  - 'apps/*'\n  - packages/*\n")
	fake.Files["/home/dev/projects/candidate/pnpm-lock.yaml"] = []byte("lockfileVersion: '9.0'\n")

	whole, err := reader.Detect("", "candidate", "")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}
	detected := only(t, whole)

	if len(detected.Routes) != 3 || detected.PkgMgr != "pnpm" {
		t.Fatalf("unexpected detection: %+v", detected)
	}
}

func TestDetectDoesNotReadWorkspacesWithoutTurbo(t *testing.T) {
	fake, reader := monorepoFixture(t)
	delete(fake.Files, "/home/dev/projects/candidate/turbo.json")

	whole, err := reader.Detect("", "candidate", "")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}
	detected := only(t, whole)

	if len(detected.Routes) != 0 || !strings.HasPrefix(detected.Cmd, "pnpm dev") {
		t.Fatalf("unexpected detection: %+v", detected)
	}
}
