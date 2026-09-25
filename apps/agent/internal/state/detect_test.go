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

// What create-vite lays down: no lockfile, and a dev script that names no port.
const vitePackage = `{
  "name": "flyleaf",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "devDependencies": { "vite": "^7.0.0" }
}
`

const viteConfig = `import { defineConfig } from "vite"

export default defineConfig({ plugins: [] })
`

func only(t *testing.T, detected contract.ProjectDetect) contract.DetectedProcess {
	t.Helper()

	if len(detected.Processes) != 1 {
		t.Fatalf("got %d processes, want one: %+v", len(detected.Processes), detected.Processes)
	}

	return detected.Processes[0]
}

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

	detected, err := reader.Detect("", "candidate", "")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}

	if err := contract.ValidateValue("ProjectDetectResult", detected); err != nil {
		t.Fatalf("detection violates the contract: %v", err)
	}

	// 3000 belongs to the fixture's declared project, so the hint must name the next free port.
	process := only(t, detected)
	if process.ID != "flyleaf" || process.Dir != "." || process.PkgMgr != "bun" || process.Install != "bun install" || process.Cmd != "bun run dev --port 3001" || process.PortHint != 3001 {
		t.Fatalf("unexpected detection: %+v", process)
	}
}

func TestDetectProposesOneProcessPerFolderThatAsksForOne(t *testing.T) {
	reader := detectFixture(t, map[string]string{
		"gradlew":                            "#!/bin/sh\n",
		"settings.gradle":                    "pluginManagement {}\ninclude 'client', 'server'\n",
		"server/build.gradle":                "plugins { id \"org.grails.grails-web\" }\n",
		"client/package.json":                `{"name":"client","scripts":{"dev":"pnpm tools:extract && vite --host 127.0.0.1"}}`,
		"client/pnpm-lock.yaml":              "lockfileVersion: '9.0'\n",
		"client/vite.config.ts":              "export default { server: { port: 3001 } }\n",
		"docs/README.md":                     "docs\n",
		"mobile/gradlew":                     "#!/bin/sh\n",
		"mobile/settings.gradle.kts":         "include(\":app\")\n",
		"mobile/app/build.gradle.kts":        "plugins { id(\"com.android.application\") }\n",
		"node_modules/left-pad/package.json": `{"name":"left-pad","scripts":{"dev":"node index.js --port 9000"}}`,
	})

	detected, err := reader.Detect("", "candidate", "")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}

	if err := contract.ValidateValue("ProjectDetectResult", detected); err != nil {
		t.Fatalf("detection violates the contract: %v", err)
	}

	if len(detected.Processes) != 2 {
		t.Fatalf("got %d processes, want the Grails server and the client: %+v", len(detected.Processes), detected.Processes)
	}

	server := detected.Processes[0]
	if server.ID != "server" || server.Dir != "." || server.PkgMgr != "gradle" || server.Cmd != "./gradlew :server:bootRun --args='--server.port=3001'" || server.PortHint != 3001 {
		t.Fatalf("the Grails subproject runs from the wrapper's folder: %+v", server)
	}

	client := detected.Processes[1]
	if client.ID != "client" || client.Dir != "client" || client.PkgMgr != "pnpm" || client.Cmd != "pnpm dev --port 3002" || client.PortHint != 3002 {
		t.Fatalf("the client asks for 3001 too, and takes the next free port: %+v", client)
	}
}

func TestDetectKeepsThePortAServerDeclaresInItsConfiguration(t *testing.T) {
	reader := detectFixture(t, map[string]string{
		"gradlew":                                "#!/bin/sh\n",
		"settings.gradle":                        "include 'client', 'server'\n",
		"server/build.gradle":                    "plugins { id \"org.grails.grails-web\" }\n",
		"server/grails-app/conf/application.yml": "grails:\n  profile: web\nserver:\n  port: 8081\n\nspring:\n  main:\n    banner-mode: 'off'\n",
		"client/package.json":                    `{"name":"client","scripts":{"dev":"vite --host 127.0.0.1"}}`,
		"client/pnpm-lock.yaml":                  "lockfileVersion: '9.0'\n",
		"client/vite.config.ts":                  "export default { server: { port: 3001, proxy: { '/api': 'http://localhost:8081' } } }\n",
	})

	detected, err := reader.Detect("", "candidate", "")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}

	if len(detected.Processes) != 2 {
		t.Fatalf("got %d processes: %+v", len(detected.Processes), detected.Processes)
	}

	server := detected.Processes[0]
	if server.ID != "server" || server.PortHint != 8081 || server.Cmd != "./gradlew :server:bootRun --args='--server.port=8081'" {
		t.Fatalf("the server keeps the port its configuration names: %+v", server)
	}

	if client := detected.Processes[1]; client.PortHint != 3001 || client.Cmd != "pnpm dev --port 3001" {
		t.Fatalf("the client keeps its own port, which the server no longer takes: %+v", client)
	}
}

func TestDetectReadsASpringBootPortFromItsProperties(t *testing.T) {
	reader := detectFixture(t, map[string]string{
		"gradlew":      "#!/bin/sh\n",
		"build.gradle": "plugins { id 'org.springframework.boot' version '3.3.0' }\n",
		"src/main/resources/application.properties": "spring.application.name=atlas\nserver.port = 9090\n",
	})

	detected, err := reader.Detect("", "candidate", "")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}

	if process := only(t, detected); process.PortHint != 9090 || process.Cmd != "./gradlew bootRun --args='--server.port=9090'" {
		t.Fatalf("unexpected detection: %+v", process)
	}
}

func TestDetectProposesTheRootBuildItselfWhenItIsAServer(t *testing.T) {
	reader := detectFixture(t, map[string]string{
		"gradlew":      "#!/bin/sh\n",
		"build.gradle": "plugins { id 'org.springframework.boot' version '3.3.0' }\n",
	})

	detected, err := reader.Detect("", "candidate", "")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}

	process := only(t, detected)
	if process.ID != "app" || process.Dir != "." || process.Cmd != "./gradlew bootRun --args='--server.port=3001'" {
		t.Fatalf("unexpected detection: %+v", process)
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
			files:  map[string]string{"pyproject.toml": "[project]\nname = \"flyleaf\"\n"},
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
			files:  map[string]string{"README.md": "flyleaf\n"},
			pkgmgr: "none",
			cmd:    "",
		},
	} {
		t.Run(want.name, func(t *testing.T) {
			detected, err := detectFixture(t, want.files).Detect("", "candidate", "")
			if err != nil {
				t.Fatalf("detect: %v", err)
			}

			if process := only(t, detected); process.PkgMgr != want.pkgmgr || process.Cmd != want.cmd {
				t.Fatalf("unexpected detection: %+v", process)
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
			detected, err := detectFixture(t, want.files).Detect("", "candidate", "")
			if err != nil {
				t.Fatalf("detect: %v", err)
			}

			if process := only(t, detected); process.PortHint != want.port {
				t.Fatalf("unexpected port hint: %+v", process)
			}
		})
	}
}

func TestDetectReadsTheLocalhostNameTheScriptBindsTo(t *testing.T) {
	for _, want := range []struct {
		name   string
		script string
		host   string
	}{
		{name: "from --host", script: "vite dev --host react-box.localhost --port 3000", host: "react-box.localhost"},
		{name: "from --host=", script: "vite --host=api.shop.localhost --port 3000", host: "api.shop.localhost"},
		{name: "not from an address", script: "vite --host 0.0.0.0 --port 3000"},
		{name: "not from a public name", script: "vite --host shop.example.org --port 3000"},
	} {
		t.Run(want.name, func(t *testing.T) {
			files := map[string]string{"package.json": `{"scripts":{"dev":"` + want.script + `"}}`}

			detected, err := detectFixture(t, files).Detect("", "candidate", "")
			if err != nil {
				t.Fatalf("detect: %v", err)
			}

			if process := only(t, detected); process.HostHint != want.host {
				t.Fatalf("host hint = %q, want %q", process.HostHint, want.host)
			}
		})
	}
}

func TestDetectFollowsAScriptThatRunsAnotherOne(t *testing.T) {
	files := map[string]string{"package.json": `{"scripts":{
		"dev": "bun run dev:web",
		"dev:web": "bun run dev:app",
		"dev:app": "bun run prepare && bun scripts/wrap.ts -- node vite.js dev --host react-box.localhost --port 4400",
		"loop": "bun run loop"
	}}`}

	detected, err := detectFixture(t, files).Detect("", "candidate", "")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}

	if process := only(t, detected); process.PortHint != 4400 || process.HostHint != "react-box.localhost" || process.Cmd != "bun run dev --port 4400" {
		t.Fatalf("unexpected detection: %+v", process)
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
			_, err := reader.Detect(want.repo, want.dir, "")

			failure, ok := err.(*protocol.Error)
			if !ok || failure.Code != contract.ErrorBadRequest {
				t.Fatalf("expected a bad_request, got %v", err)
			}
		})
	}
}

func TestDetectClonesARepositoryAndLeavesNothingBehind(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}

	base := t.TempDir()
	origin := filepath.Join(base, "flyleaf.git")
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

	// file:// keeps --depth honoured: git ignores it on a plain local path.
	detected, err := reader.Detect("file://"+origin, "", "")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}

	if err := contract.ValidateValue("ProjectDetectResult", detected); err != nil {
		t.Fatalf("detection violates the contract: %v", err)
	}

	if process := only(t, detected); process.PkgMgr != "bun" || process.Install != "bun install" || process.Cmd != "bun run dev --port 3000" || process.PortHint != 3000 {
		t.Fatalf("unexpected detection: %+v", process)
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

func TestDetectFetchesTheManifestsAndNotTheRest(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}

	base := t.TempDir()
	origin := filepath.Join(base, "atlas.git")
	run(t, base, "git", "init", "--quiet", "--bare", "--initial-branch=main", origin)
	run(t, origin, "git", "config", "uploadpack.allowFilter", "true")

	seed := filepath.Join(base, "seed")
	run(t, base, "git", "clone", "--quiet", origin, seed)
	write(t, filepath.Join(seed, "package.json"), `{"name":"atlas","packageManager":"pnpm@9.0.0","workspaces":["apps/*"]}`)
	write(t, filepath.Join(seed, "turbo.json"), `{"tasks":{"dev":{}}}`)
	write(t, filepath.Join(seed, "apps", "web", "package.json"), `{"name":"@atlas/web","scripts":{"dev":"vite --host atlas.localhost --port 3010"}}`)
	write(t, filepath.Join(seed, "apps", "web", "src", "main.ts"), "export {}\n")
	write(t, filepath.Join(seed, "assets", "big.bin"), strings.Repeat("x", 200_000))
	write(t, filepath.Join(seed, "server", "grails-app", "conf", "application.yml"), "server:\n  port: 8081\n")
	run(t, seed, "git", "add", "-A")
	run(t, seed, "git", "commit", "--quiet", "-m", "atlas")
	run(t, seed, "git", "push", "--quiet", "origin", "main")

	var calls []sys.Command

	reader := state.New(state.Options{
		Sys:          recorder{calls: &calls},
		Now:          modtest.NewClock(time.Millisecond).Now,
		Registry:     modules.NewRegistry(),
		AgentVersion: "0.0.0-test",
		Paths:        registry.Paths{Conf: filepath.Join(base, "projects.conf"), Local: filepath.Join(base, "projects.local.conf"), Projects: filepath.Join(base, "projects")},
		Tmux:         tmux.Options{User: "root", LogDir: filepath.Join(base, "logs")},
		Detect:       state.DetectOptions{Cache: filepath.Join(base, "cache"), Name: func() string { return "detection" }},
		Sleep:        func(time.Duration) {},
	})

	detected, err := reader.Detect("file://"+origin, "", "")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}

	if process := only(t, detected); process.ID != "atlas" || process.PkgMgr != "pnpm" || process.HostHint != "atlas.localhost" || len(process.Routes) != 1 || process.Routes[0].Port != 3010 {
		t.Fatalf("unexpected detection: %+v", process)
	}

	if !cloned(calls, "--filter=blob:limit=65536", "--no-checkout") {
		t.Fatalf("the clone must leave the big blobs and the working tree behind: %v", calls)
	}

	for _, call := range calls {
		line := strings.Join(call.Argv, " ")
		if strings.Contains(line, "git checkout") && (strings.Contains(line, "big.bin") || strings.Contains(line, "main.ts")) {
			t.Fatalf("only the manifests are written: %s", line)
		}
		if strings.Contains(line, "git checkout") && !strings.Contains(line, "apps/web/package.json") {
			t.Fatalf("the workspace manifests are among them: %s", line)
		}
		if strings.Contains(line, "git checkout") && !strings.Contains(line, "server/grails-app/conf/application.yml") {
			t.Fatalf("a server's own configuration is among them, deeper than a manifest sits: %s", line)
		}
	}
}

func TestDetectReadsTheBranchItIsGiven(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}

	base := t.TempDir()
	origin := filepath.Join(base, "flyleaf.git")
	run(t, base, "git", "init", "--quiet", "--bare", "--initial-branch=main", origin)

	seed := filepath.Join(base, "seed")
	run(t, base, "git", "clone", "--quiet", origin, seed)
	write(t, filepath.Join(seed, "package.json"), `{"scripts":{"dev":"vite --port 4321"}}`)
	run(t, seed, "git", "add", "-A")
	run(t, seed, "git", "commit", "--quiet", "-m", "create-vite")
	run(t, seed, "git", "push", "--quiet", "origin", "main")

	run(t, seed, "git", "checkout", "--quiet", "-b", "release/2.0")
	write(t, filepath.Join(seed, "package.json"), `{"scripts":{"dev":"vite --port 4200"}}`)
	run(t, seed, "git", "add", "-A")
	run(t, seed, "git", "commit", "--quiet", "-m", "la deux")
	run(t, seed, "git", "push", "--quiet", "origin", "release/2.0")

	var calls []sys.Command

	reader := state.New(state.Options{
		Sys:          recorder{calls: &calls},
		Now:          modtest.NewClock(time.Millisecond).Now,
		Registry:     modules.NewRegistry(),
		AgentVersion: "0.0.0-test",
		Paths:        registry.Paths{Conf: filepath.Join(base, "projects.conf"), Local: filepath.Join(base, "projects.local.conf"), Projects: filepath.Join(base, "projects")},
		Tmux:         tmux.Options{User: "root", LogDir: filepath.Join(base, "logs")},
		Detect:       state.DetectOptions{Cache: filepath.Join(base, "cache"), Name: func() string { return "detection" }},
		Sleep:        func(time.Duration) {},
	})

	detected, err := reader.Detect("file://"+origin, "", "release/2.0")
	if err != nil {
		t.Fatalf("detect: %v", err)
	}

	if process := only(t, detected); process.PortHint != 4200 {
		t.Fatalf("the branch's own port must be the one read: %+v", process)
	}

	if !cloned(calls, "--branch", "release/2.0") {
		t.Fatalf("the clone must name the branch: %v", calls)
	}
}

func TestDetectRefusesABranchGitMustNeverSee(t *testing.T) {
	reader := detectFixture(t, map[string]string{"package.json": vitePackage})

	_, err := reader.Detect("https://example.invalid/x.git", "", "--upload-pack=touch")

	failure, ok := err.(*protocol.Error)
	if !ok || failure.Code != contract.ErrorBadRequest {
		t.Fatalf("expected a bad_request, got %v", err)
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
		Sys:          asMe{t: t},
		Now:          modtest.NewClock(time.Millisecond).Now,
		Registry:     modules.NewRegistry(),
		AgentVersion: "0.0.0-test",
		Paths:        registry.Paths{Conf: filepath.Join(base, "projects.conf"), Local: filepath.Join(base, "projects.local.conf"), Projects: filepath.Join(base, "projects")},
		Tmux:         tmux.Options{User: "root", LogDir: filepath.Join(base, "logs")},
		Detect:       state.DetectOptions{Cache: cache, Name: func() string { return "detection" }},
		Sleep:        func(time.Duration) {},
	})

	_, err := reader.Detect("file://"+filepath.Join(base, "ghost.git"), "", "")

	failure, ok := err.(*protocol.Error)
	if !ok || failure.Code != contract.ErrorInternal {
		t.Fatalf("expected an internal error, got %v", err)
	}

	if _, err := os.Stat(filepath.Join(cache, "detection")); !os.IsNotExist(err) {
		t.Fatalf("a failed clone leaves nothing behind: %v", err)
	}
}
