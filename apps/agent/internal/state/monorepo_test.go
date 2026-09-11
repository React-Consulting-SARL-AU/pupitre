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

// The Turborepo of testdata, laid down under the projects root of the fake machine as if it had been cloned there.
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

// One command at the root, one route per workspace that names a port: the label is the workspace's name without its scope, the port the one it asks for when the server has it free.
func TestDetectReadsATurborepoAsOneProjectWithSeveralPorts(t *testing.T) {
	_, reader := monorepoFixture(t)

	detected, err := reader.Detect("", "candidate", "")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}

	if err := contract.ValidateValue("ProjectDetectResult", detected); err != nil {
		t.Fatalf("detection violates the contract: %v", err)
	}

	if detected.PkgMgr != "pnpm" || detected.Install != "pnpm install" || detected.Cmd != "pnpm exec turbo run dev" {
		t.Fatalf("unexpected detection: %+v", detected)
	}

	// The folders come in name order; web asks for 3000, which the declared project of the fixture holds, so the next free port is proposed instead.
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

// A workspace without a start script, or whose script names no port, is a library: it gets no route.
func TestDetectSkipsTheWorkspacesThatDoNotListen(t *testing.T) {
	_, reader := monorepoFixture(t)

	detected, err := reader.Detect("", "candidate", "")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}

	for _, route := range detected.Routes {
		if route.Label == "ui" {
			t.Fatalf("a package that builds and never listens is not a route: %+v", detected.Routes)
		}
	}
}

// Two ports asked for twice are given once: the second workspace on 3001 takes the next free port.
func TestDetectGivesEachWorkspaceItsOwnPort(t *testing.T) {
	fake, reader := monorepoFixture(t)
	fake.Files["/home/dev/projects/candidate/apps/api/package.json"] = []byte(`{"name":"@atlas/api","scripts":{"start":"node server.js -p 3002"}}`)

	detected, err := reader.Detect("", "candidate", "")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}

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

	detected, err := reader.Detect("", "candidate", "")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}

	if len(detected.Routes) != 3 || detected.PkgMgr != "pnpm" {
		t.Fatalf("unexpected detection: %+v", detected)
	}
}

// Without turbo.json the root is an ordinary project, whatever its workspaces say: one command, one port.
func TestDetectDoesNotReadWorkspacesWithoutTurbo(t *testing.T) {
	fake, reader := monorepoFixture(t)
	delete(fake.Files, "/home/dev/projects/candidate/turbo.json")

	detected, err := reader.Detect("", "candidate", "")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}

	if len(detected.Routes) != 0 || !strings.HasPrefix(detected.Cmd, "pnpm dev") {
		t.Fatalf("unexpected detection: %+v", detected)
	}
}
