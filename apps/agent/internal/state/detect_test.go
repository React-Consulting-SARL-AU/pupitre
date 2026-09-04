package state_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/state"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/tmux"
)

type recorder struct {
	asMe
	calls *[]sys.Command
}

func (r recorder) Run(cmd sys.Command) (sys.Output, error) {
	*r.calls = append(*r.calls, cmd)

	return r.asMe.Run(cmd)
}

// What create-vite lays down, and nothing more: no lockfile, a dev script that names no port.
const vitePackage = `{
  "name": "flymate",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "devDependencies": { "vite": "^7.0.0" }
}
`

const viteConfig = `import { defineConfig } from "vite"

export default defineConfig({ plugins: [] })
`

func detectFixture(t *testing.T, files map[string]string) *state.Reader {
	t.Helper()

	fake, reader := fixture(t)
	fake.Dirs["/home/dev/projects/candidate"] = true

	for name, content := range files {
		fake.Files["/home/dev/projects/candidate/"+name] = []byte(content)
	}

	return reader
}

func TestDetectReadsAFolderWithoutInstallingAnything(t *testing.T) {
	reader := detectFixture(t, map[string]string{"package.json": vitePackage, "vite.config.ts": viteConfig})

	detected, err := reader.Detect("", "candidate")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}

	if err := contract.ValidateValue("ProjectDetectResult", detected); err != nil {
		t.Fatalf("detection violates the contract: %v", err)
	}

	// 3000 is the port of the declared project of the fixture, so the free one below it is what the hint has to name.
	if detected.PkgMgr != "bun" || detected.Install != "bun install" || detected.Cmd != "bun run dev --port 3001" || detected.PortHint != 3001 {
		t.Fatalf("unexpected detection: %+v", detected)
	}
}

func TestDetectNamesTheManagerTheRepositoryProves(t *testing.T) {
	for _, want := range []struct {
		name   string
		files  map[string]string
		pkgmgr string
		cmd    string
	}{
		{
			name:   "a lockfile of pnpm",
			files:  map[string]string{"package.json": vitePackage, "pnpm-lock.yaml": "lockfileVersion: '9.0'\n"},
			pkgmgr: "pnpm",
			cmd:    "pnpm dev --port 3001",
		},
		{
			name:   "a lockfile of npm",
			files:  map[string]string{"package.json": vitePackage, "package-lock.json": "{}\n"},
			pkgmgr: "npm",
			cmd:    "npm run dev -- --port 3001",
		},
		{
			name:   "a declared packageManager over a lockfile",
			files:  map[string]string{"package.json": `{"packageManager":"pnpm@9.0.0","scripts":{"dev":"vite"}}`, "bun.lock": "{}\n"},
			pkgmgr: "pnpm",
			cmd:    "pnpm dev --port 3001",
		},
		{
			name:   "a python project",
			files:  map[string]string{"pyproject.toml": "[project]\nname = \"flymate\"\n"},
			pkgmgr: "uv",
			cmd:    "uv run dev --port 3001",
		},
		{
			name:   "a gradle project",
			files:  map[string]string{"gradlew": "#!/bin/sh\n"},
			pkgmgr: "gradle",
			cmd:    "./gradlew bootRun --args='--server.port=3001'",
		},
		{
			name:   "a folder that proves nothing",
			files:  map[string]string{"README.md": "flymate\n"},
			pkgmgr: "none",
			cmd:    "",
		},
	} {
		t.Run(want.name, func(t *testing.T) {
			detected, err := detectFixture(t, want.files).Detect("", "candidate")
			if err != nil {
				t.Fatalf("detect: %v", err)
			}

			if detected.PkgMgr != want.pkgmgr || detected.Cmd != want.cmd {
				t.Fatalf("unexpected detection: %+v", detected)
			}
		})
	}
}

func TestDetectTakesThePortTheRepositoryAsksFor(t *testing.T) {
	for _, want := range []struct {
		name  string
		files map[string]string
		port  int
	}{
		{
			name:  "from the dev script",
			files: map[string]string{"package.json": `{"scripts":{"dev":"vite --port 4321"}}`},
			port:  4321,
		},
		{
			name:  "from the vite configuration",
			files: map[string]string{"package.json": vitePackage, "vite.config.ts": "export default { server: { port: 4200 } }\n"},
			port:  4200,
		},
		{
			name:  "and gives up on a port a project already holds",
			files: map[string]string{"package.json": `{"scripts":{"dev":"vite --port 3000"}}`},
			port:  3001,
		},
	} {
		t.Run(want.name, func(t *testing.T) {
			detected, err := detectFixture(t, want.files).Detect("", "candidate")
			if err != nil {
				t.Fatalf("detect: %v", err)
			}

			if detected.PortHint != want.port {
				t.Fatalf("unexpected port hint: %+v", detected)
			}
		})
	}
}

func TestDetectRefusesWhatItCannotRead(t *testing.T) {
	reader := detectFixture(t, map[string]string{"package.json": vitePackage})

	for _, want := range []struct {
		name string
		repo string
		dir  string
	}{
		{name: "a folder outside the projects root", dir: "../../etc"},
		{name: "a folder that is not there", dir: "ghost"},
		{name: "a repository and a folder at once", repo: "https://example.invalid/x.git", dir: "candidate"},
		{name: "neither of the two"},
	} {
		t.Run(want.name, func(t *testing.T) {
			_, err := reader.Detect(want.repo, want.dir)

			failure, ok := err.(*protocol.Error)
			if !ok || failure.Code != contract.ErrorBadRequest {
				t.Fatalf("expected a bad_request, got %v", err)
			}
		})
	}
}

// A repository is cloned in surface and read, and the machine keeps nothing of it.
func TestDetectClonesARepositoryAndLeavesNothingBehind(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}

	base := t.TempDir()
	origin := filepath.Join(base, "flymate.git")
	run(t, base, "git", "init", "--quiet", "--bare", "--initial-branch=main", origin)

	seed := filepath.Join(base, "seed")
	run(t, base, "git", "clone", "--quiet", origin, seed)
	write(t, filepath.Join(seed, "package.json"), vitePackage)
	write(t, filepath.Join(seed, "vite.config.ts"), viteConfig)
	run(t, seed, "git", "add", "-A")
	run(t, seed, "git", "commit", "--quiet", "-m", "create-vite")
	run(t, seed, "git", "push", "--quiet", "origin", "main")

	cache := filepath.Join(base, "cache")
	projects := filepath.Join(base, "projects")

	var calls []sys.Command

	reader := state.New(state.Options{
		Sys:          recorder{calls: &calls},
		Now:          modtest.NewClock(time.Millisecond).Now,
		Registry:     modules.NewRegistry(),
		AgentVersion: "0.0.0-test",
		Paths:        registry.Paths{Conf: filepath.Join(base, "projects.conf"), Local: filepath.Join(base, "projects.local.conf"), Projects: projects},
		Tmux:         tmux.Options{User: "root", LogDir: filepath.Join(base, "logs")},
		Detect:       state.DetectOptions{Cache: cache, Name: func() string { return "detection" }},
		Sleep:        func(time.Duration) {},
	})

	// file:// keeps the depth honoured: git ignores --depth on a plain local path.
	detected, err := reader.Detect("file://"+origin, "")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}

	if err := contract.ValidateValue("ProjectDetectResult", detected); err != nil {
		t.Fatalf("detection violates the contract: %v", err)
	}

	if detected.PkgMgr != "bun" || detected.Install != "bun install" || detected.Cmd != "bun run dev --port 3000" || detected.PortHint != 3000 {
		t.Fatalf("unexpected detection: %+v", detected)
	}

	if _, err := os.Stat(filepath.Join(cache, "detection")); !os.IsNotExist(err) {
		t.Fatalf("the shallow clone must be gone: %v", err)
	}

	if _, err := os.Stat(projects); !os.IsNotExist(err) {
		t.Fatal("a detection writes nothing in the projects root")
	}

	if !cloned(calls, "--depth", "1") {
		t.Fatalf("the clone must stay in surface: %v", calls)
	}
}

func cloned(calls []sys.Command, flags ...string) bool {
	for _, call := range calls {
		line := strings.Join(call.Argv, " ")
		if strings.HasPrefix(line, "git clone ") && strings.Contains(line, strings.Join(flags, " ")) {
			return true
		}
	}

	return false
}

func TestDetectRefusesARepositoryItCannotClone(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}

	base := t.TempDir()
	cache := filepath.Join(base, "cache")

	reader := state.New(state.Options{
		Sys:          asMe{},
		Now:          modtest.NewClock(time.Millisecond).Now,
		Registry:     modules.NewRegistry(),
		AgentVersion: "0.0.0-test",
		Paths:        registry.Paths{Conf: filepath.Join(base, "projects.conf"), Local: filepath.Join(base, "projects.local.conf"), Projects: filepath.Join(base, "projects")},
		Tmux:         tmux.Options{User: "root", LogDir: filepath.Join(base, "logs")},
		Detect:       state.DetectOptions{Cache: cache, Name: func() string { return "detection" }},
		Sleep:        func(time.Duration) {},
	})

	_, err := reader.Detect("file://"+filepath.Join(base, "ghost.git"), "")

	failure, ok := err.(*protocol.Error)
	if !ok || failure.Code != contract.ErrorInternal {
		t.Fatalf("expected an internal error, got %v", err)
	}

	if _, err := os.Stat(filepath.Join(cache, "detection")); !os.IsNotExist(err) {
		t.Fatalf("a failed clone leaves nothing behind: %v", err)
	}
}
