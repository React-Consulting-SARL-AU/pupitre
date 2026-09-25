package state_test

import (
	"context"
	"errors"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/state"
	"pupitre.studio/agent/internal/sudo"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/lock"
	"pupitre.studio/agent/internal/tmux"
)

const conf = `# name|dir|repo|pkgmgr|host|port|sub|cmd|install
web|web|https://github.com/me/web|bun|127.0.0.1|3000|web|bun run dev --port 3000
shots|.|-|service|127.0.0.1|8099|shots|-|-
`

func machine(fake *modtest.FakeSys) {
	fake.Files["/etc/hostname"] = []byte("pupitre-staging\n")
	fake.Files["/etc/os-release"] = []byte("ID=ubuntu\nVERSION_ID=\"24.04\"\n")
	fake.Files["/proc/meminfo"] = []byte("MemTotal: 8127744 kB\nMemAvailable: 6291456 kB\nSwapTotal: 2097152 kB\nSwapFree: 2097152 kB\n")
	fake.Files["/proc/loadavg"] = []byte("0.12 0.34 0.56 1/512 900\n")
	fake.Files["/proc/uptime"] = []byte("98765.43 700000.00\n")
	fake.Replies["df -P -B1 /"] = "Filesystem 1B-blocks Used Available Capacity Mounted\n/dev/sda1 85899345920 21474836480 64424509440 25% /\n"
	fake.Replies["uname -m"] = "aarch64\n"
}

func newReader(t *testing.T, fake *modtest.FakeSys, catalog *modules.Registry, sleep func(time.Duration)) *state.Reader {
	t.Helper()

	return state.New(state.Options{
		Sys:          fake,
		Now:          modtest.NewClock(time.Millisecond).Now,
		Registry:     catalog,
		Entitlement:  func() contract.Entitlement { return contract.EntitlementDev },
		AgentVersion: "0.0.0-test",
		Follow:       state.FollowOptions{Interval: time.Millisecond, Limit: 50 * time.Millisecond, Sleep: sleep},
	})
}

func fixture(t *testing.T) (*modtest.FakeSys, *state.Reader) {
	t.Helper()

	fake := modtest.NewFakeSys()
	machine(fake)
	fake.Files[registry.DefaultConf] = []byte(conf)
	fake.Dirs["/home/dev/projects/web"] = true
	fake.Serves("web/web", 3000)

	return fake, newReader(t, fake, modules.NewRegistry(), func(time.Duration) {})
}

// One project of one process, as the screen declares most of them.
func declared(name string, port int, cmd string) (registry.Project, []state.ProcessRequest) {
	return registry.Project{Name: name, Dir: name}, []state.ProcessRequest{
		{ID: registry.LabelFrom(name), Dir: registry.RootDir, PkgMgr: "bun", Host: "127.0.0.1", Port: port, Cmd: cmd},
	}
}

func processOf(t *testing.T, project contract.Project, id string) contract.ProjectProcess {
	t.Helper()

	for _, process := range project.Processes {
		if process.ID == id {
			return process
		}
	}

	t.Fatalf("%s missing from %+v", id, project.Processes)

	return contract.ProjectProcess{}
}

func TestSnapshotReadsTheMachineTheProjectsAndTheEntitlement(t *testing.T) {
	fake, reader := fixture(t)
	fake.Files["/home/dev/projects/web/.git/HEAD"] = []byte("ref: refs/heads/feat/local-planning\n")

	snapshot := reader.Snapshot()

	if err := contract.ValidateValue("SnapshotResult", snapshot); err != nil {
		t.Fatalf("snapshot violates the contract: %v", err)
	}

	if snapshot.Machine.Hostname != "pupitre-staging" || snapshot.Machine.OS != "ubuntu" || snapshot.Machine.Version != "24.04" {
		t.Fatalf("unexpected machine: %+v", snapshot.Machine)
	}
	if snapshot.Machine.Arch != "arm64" || snapshot.Machine.RAMTotalMB != 7937 || snapshot.Machine.UptimeS != 98765 {
		t.Fatalf("unexpected machine: %+v", snapshot.Machine)
	}
	if snapshot.Machine.Load != [3]float64{0.12, 0.34, 0.56} || snapshot.Machine.DiskFreeGB != 60 {
		t.Fatalf("unexpected machine: %+v", snapshot.Machine)
	}

	if len(snapshot.Projects) != 2 {
		t.Fatalf("got %d projects, want the two rows of the registry", len(snapshot.Projects))
	}
	if snapshot.Projects[0].Branch != "feat/local-planning" {
		t.Fatalf("the whole branch path must survive: %q", snapshot.Projects[0].Branch)
	}
	if snapshot.Entitlement != contract.EntitlementDev {
		t.Fatalf("got %s", snapshot.Entitlement)
	}
}

func TestSnapshotSaysWhatSudoAsksOfDev(t *testing.T) {
	fake, reader := fixture(t)

	if got := reader.Snapshot().Machine.Sudo; got != "" {
		t.Fatalf("no sudoers rule, sudo = %q", got)
	}

	fake.Files[sudo.Path] = []byte(sudo.Open)
	if got := reader.Snapshot().Machine.Sudo; got != contract.SudoNopasswdAll {
		t.Fatalf("sudo = %q", got)
	}

	fake.Files[sudo.Path] = []byte(sudo.Restricted)
	snapshot := reader.Snapshot()
	if snapshot.Machine.Sudo != contract.SudoPassword {
		t.Fatalf("sudo = %q", snapshot.Machine.Sudo)
	}

	if err := contract.ValidateValue("SnapshotResult", snapshot); err != nil {
		t.Fatal(err)
	}
}

func TestAddThenUpBringsTheProjectOnlineAndDownStopsIt(t *testing.T) {
	fake, reader := fixture(t)
	fake.Serves("api/api", 5173)

	added, err := reader.Add(declared("api", 5173, "bun run dev --port 5173"))
	if err != nil {
		t.Fatal(err)
	}
	if added.State != contract.ProjectStopped || len(added.Processes) != 1 || added.Processes[0].State != contract.ProcessStopped {
		t.Fatalf("a project that has just been declared is stopped, got %+v", added)
	}

	up, err := reader.Up("api", "")
	if err != nil {
		t.Fatal(err)
	}
	if up.State != contract.ProjectOnline {
		t.Fatalf("unexpected result: %+v", up)
	}

	got := projectOf(t, reader.Snapshot().Projects, "api")
	if got.State != contract.ProjectOnline || processOf(t, got, "api").State != contract.ProcessOnline || processOf(t, got, "api").Port != 5173 {
		t.Fatalf("snapshot must show it online with its port: %+v", got)
	}

	fake.Files[tmux.Options{}.LogPath("api/api")] = append(fake.Files[tmux.Options{}.LogPath("api/api")], []byte("vite v7 ready in 412 ms\n")...)

	lines, err := reader.Logs("api", "api", 1)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(lines, "") != "vite v7 ready in 412 ms" {
		t.Fatalf("project.logs must return the output: %q", lines)
	}

	down, err := reader.Down("api", "")
	if err != nil {
		t.Fatal(err)
	}
	if down.State != contract.ProjectStopped {
		t.Fatalf("got %s", down.State)
	}
	if got := projectOf(t, reader.Snapshot().Projects, "api"); got.State != contract.ProjectStopped {
		t.Fatalf("snapshot must show it stopped: %+v", got)
	}
}

// A repository brings its own folders with the clone: declaring one must leave the projects root untouched, or git refuses to clone into what it finds there.
func TestAddCreatesNoFolderForARepositoryProject(t *testing.T) {
	fake, reader := fixture(t)

	project, processes := declared("intranet", 8081, "./gradlew :server:bootRun")
	project.Repo = "https://github.com/eapc-dev/intranet.git"
	processes = append(processes, state.ProcessRequest{ID: "client", Dir: "client", PkgMgr: "pnpm", Host: "127.0.0.1", Port: 3001, Cmd: "pnpm dev --port 3001"})

	if _, err := reader.Add(project, processes); err != nil {
		t.Fatal(err)
	}

	for _, path := range []string{"/home/dev/projects/intranet", "/home/dev/projects/intranet/client"} {
		if fake.Dirs[path] {
			t.Fatalf("%s must not exist before the clone: %v", path, fake.Mutations)
		}
	}
}

// A folder left by an earlier project is found out at the declaration, when nothing has been written yet: the refusal says what to do with it.
func TestAddRefusesARepositoryProjectWhoseFolderIsAlreadyBusy(t *testing.T) {
	fake, reader := fixture(t)
	fake.Dirs["/home/dev/projects/intranet"] = true
	fake.Files["/home/dev/projects/intranet/client/package.json"] = []byte("{}")

	project, processes := declared("intranet", 8081, "./gradlew :server:bootRun")
	project.Repo = "https://github.com/eapc-dev/intranet.git"

	_, err := reader.Add(project, processes)
	if err == nil {
		t.Fatal("a folder that is not empty cannot receive a clone: the declaration must say so")
	}

	failure, ok := err.(*protocol.Error)
	if !ok || failure.Code != contract.ErrorBadRequest || !strings.Contains(failure.Message, "/home/dev/projects/intranet") {
		t.Fatalf("expected a bad_request naming the folder, got %v", err)
	}
	if _, known := reader.List(), false; known || len(reader.List()) != 2 {
		t.Fatalf("nothing must have been declared: %+v", reader.List())
	}

	delete(fake.Files, "/home/dev/projects/intranet/client/package.json")
	if _, err := reader.Add(project, processes); err != nil {
		t.Fatalf("an empty folder is fine, git clones into it: %v", err)
	}
}

// A folder already on the machine is taken as it stands; a process folder it lacks is made, so the window has somewhere to open.
func TestAddCreatesTheProcessFoldersOfAFolderProject(t *testing.T) {
	fake, reader := fixture(t)
	fake.Dirs["/home/dev/projects/local"] = true

	project, processes := declared("local", 8081, "bun run dev")
	processes = append(processes, state.ProcessRequest{ID: "client", Dir: "client", PkgMgr: "bun", Host: "127.0.0.1", Port: 3001, Cmd: "bun run dev --port 3001"})

	if _, err := reader.Add(project, processes); err != nil {
		t.Fatal(err)
	}

	if !fake.Dirs["/home/dev/projects/local/client"] {
		t.Fatalf("the client folder must exist: %v", fake.Mutations)
	}
}

func TestACommandThatDiedReadsAsFailedUntilItIsStoppedOrStartedAgain(t *testing.T) {
	fake, reader := fixture(t)

	if _, err := reader.Add(declared("api", 5173, "bun run dev --port 5173")); err != nil {
		t.Fatal(err)
	}

	up, err := reader.Up("api", "")
	if err != nil {
		t.Fatal(err)
	}
	if up.State != contract.ProjectStarting {
		t.Fatalf("a command that has not bound its port yet is starting, got %s", up.State)
	}

	fake.Dies("api/api", 1)
	got := projectOf(t, reader.Snapshot().Projects, "api")
	if got.State != contract.ProjectFailed || processOf(t, got, "api").PID != 0 {
		t.Fatalf("a dead command is a failure with no pid: %+v", got)
	}

	again, err := reader.Up("api", "")
	if err != nil {
		t.Fatal(err)
	}
	if again.State != contract.ProjectStarting {
		t.Fatalf("up must replace the corpse and start again, got %s", again.State)
	}

	fake.Dies("api/api", 0)
	down, err := reader.Down("api", "")
	if err != nil {
		t.Fatal(err)
	}
	if down.State != contract.ProjectStopped {
		t.Fatalf("down must close a dead window, got %s", down.State)
	}
	if _, open := fake.Windows["api/api"]; open {
		t.Fatalf("the corpse must be gone: %v", fake.Mutations)
	}
}

func TestSnapshotAnswersUnderThreeHundredMillisecondsWithTenProjects(t *testing.T) {
	fake := modtest.NewFakeSys()
	machine(fake)

	var rows strings.Builder
	for i := range 10 {
		name := string(rune('a'+i)) + "-app"
		port := 3000 + i
		rows.WriteString(name + "|" + name + "|-|bun|127.0.0.1|" + strconv.Itoa(port) + "|" + name + "|bun run dev --port " + strconv.Itoa(port) + "\n")
		fake.Dirs["/home/dev/projects/"+name] = true
		fake.Serves(name+"/"+name, port)
	}
	fake.Files[registry.DefaultConf] = []byte(rows.String())

	read := newReader(t, fake, modules.NewRegistry(), func(time.Duration) {})
	if _, err := read.Up(state.All, ""); err != nil {
		t.Fatal(err)
	}

	started := time.Now()
	snapshot := read.Snapshot()
	elapsed := time.Since(started)

	if len(snapshot.Projects) != 10 {
		t.Fatalf("got %d projects", len(snapshot.Projects))
	}
	for _, project := range snapshot.Projects {
		if project.State != contract.ProjectOnline {
			t.Fatalf("%s: got %s", project.Name, project.State)
		}
	}

	t.Logf("snapshot with ten projects took %s", elapsed.Round(time.Microsecond))
	if elapsed > 300*time.Millisecond {
		t.Fatalf("snapshot took %s, the budget is 300 ms", elapsed)
	}
}

func TestUpAllLeavesTheServiceRowsToSystemd(t *testing.T) {
	fake, reader := fixture(t)

	if _, err := reader.Up(state.All, ""); err != nil {
		t.Fatal(err)
	}

	if _, opened := fake.Windows["shots/shots"]; opened {
		t.Fatal("a service row never gets a tmux window")
	}
	if _, opened := fake.Windows["web/web"]; !opened {
		t.Fatal("web must have been started")
	}
}

func TestAServiceRowIsSeenThroughItsPort(t *testing.T) {
	fake, reader := fixture(t)

	if got := projectOf(t, reader.Snapshot().Projects, "shots").State; got != contract.ProjectDown {
		t.Fatalf("got %s", got)
	}

	fake.Listen[8099] = true
	if got := projectOf(t, reader.Snapshot().Projects, "shots").State; got != contract.ProjectService {
		t.Fatalf("got %s", got)
	}
}

func TestFollowEmitsTheTailThenWhatTheLogGains(t *testing.T) {
	fake := modtest.NewFakeSys()
	machine(fake)
	fake.Files[registry.DefaultConf] = []byte(conf)
	fake.Dirs["/home/dev/projects/web"] = true
	fake.Serves("web/web", 3000)

	path := tmux.Options{}.LogPath("web/web")
	rounds := 0
	grow := func(time.Duration) {
		rounds++
		if rounds == 1 {
			fake.Files[path] = append(fake.Files[path], []byte("second\n")...)
		}
	}

	reader := newReader(t, fake, modules.NewRegistry(), grow)
	if _, err := reader.Up("web", ""); err != nil {
		t.Fatal(err)
	}
	fake.Files[path] = []byte("premier\n")

	var emitted []string
	if err := reader.Follow(context.Background(), "web", "web", 10, func(line string) { emitted = append(emitted, line) }); err != nil {
		t.Fatal(err)
	}

	if len(emitted) != 2 || emitted[0] != "premier" || emitted[1] != "second" {
		t.Fatalf("the tail comes first, then what follows: %q", emitted)
	}
}

func TestFollowHoldsAHalfLineUntilItsNewline(t *testing.T) {
	fake := modtest.NewFakeSys()
	machine(fake)
	fake.Files[registry.DefaultConf] = []byte(conf)
	fake.Dirs["/home/dev/projects/web"] = true
	fake.Serves("web/web", 3000)

	path := tmux.Options{}.LogPath("web/web")
	rounds := 0
	grow := func(time.Duration) {
		rounds++
		switch rounds {
		case 1:
			fake.Files[path] = append(fake.Files[path], []byte("12.8 KiB/56")...)
		case 2:
			fake.Files[path] = append(fake.Files[path], []byte(".5 KiB downloaded\nnext\n")...)
		}
	}

	reader := newReader(t, fake, modules.NewRegistry(), grow)
	if _, err := reader.Up("web", ""); err != nil {
		t.Fatal(err)
	}
	fake.Files[path] = []byte("premier\n")

	var emitted []string
	if err := reader.Follow(context.Background(), "web", "web", 10, func(line string) { emitted = append(emitted, line) }); err != nil {
		t.Fatal(err)
	}

	want := []string{"premier", "12.8 KiB/56.5 KiB downloaded", "next"}
	if strings.Join(emitted, "|") != strings.Join(want, "|") {
		t.Fatalf("a line read in two pieces travels once, whole: %q", emitted)
	}
}

func TestFollowOutlivesARestartAndReadsTheNewJournalFromItsFirstByte(t *testing.T) {
	fake := modtest.NewFakeSys()
	machine(fake)
	fake.Files[registry.DefaultConf] = []byte(conf)
	fake.Dirs["/home/dev/projects/web"] = true
	fake.Serves("web/web", 3000)

	path := tmux.Options{}.LogPath("web/web")
	var reader *state.Reader
	rounds := 0
	grow := func(time.Duration) {
		rounds++
		switch rounds {
		case 1:
			if _, err := reader.Down("web", "web"); err != nil {
				t.Fatal(err)
			}
		case 2:
			if _, err := reader.Up("web", "web"); err != nil {
				t.Fatal(err)
			}
		case 3:
			fake.Files[path] = append(fake.Files[path], []byte("ready again\n")...)
		}
	}

	reader = newReader(t, fake, modules.NewRegistry(), grow)
	if _, err := reader.Up("web", ""); err != nil {
		t.Fatal(err)
	}
	fake.Files[path] = []byte("=== pupitre up 2026-09-18T10:00:00Z ===\na long first run that the new journal is shorter than\n")

	var emitted []string
	if err := reader.Follow(context.Background(), "web", "web", 10, func(line string) { emitted = append(emitted, line) }); err != nil {
		t.Fatal(err)
	}

	joined := strings.Join(emitted, "\n")
	if !strings.Contains(joined, "=== pupitre down ") {
		t.Fatalf("the stop marker reaches the reader: %q", emitted)
	}
	if up := strings.Count(joined, "=== pupitre up "); up != 2 {
		t.Fatalf("the new run's start marker reaches the reader once, got %d: %q", up, emitted)
	}
	if !strings.HasSuffix(joined, "ready again") {
		t.Fatalf("the new run's lines follow its marker: %q", emitted)
	}
}

func TestServiceStatusNamesTheCredentialKeysAndSnapshotDoesNot(t *testing.T) {
	fake, _ := fixture(t)
	catalog := modules.NewRegistry()
	catalog.Register(modtest.Passing{ID: "db.redis", Package: "redis-server", Unit: "redis-server", EnvKey: "REDIS_PASSWORD", Port: 6379})
	fake.Packages["redis-server"] = "7.0.15"
	fake.Units["redis-server"] = modtest.UnitActive
	reader := newReader(t, fake, catalog, func(time.Duration) {})

	status, err := reader.ServiceStatus("db.redis")
	if err != nil {
		t.Fatal(err)
	}
	if status.Credentials["Mot de passe"] != "REDIS_PASSWORD" {
		t.Fatalf("service.status must name the key: %+v", status)
	}
	if status.State != contract.ServiceRunning || status.Port != 6379 {
		t.Fatalf("unexpected status: %+v", status)
	}

	services := reader.Snapshot().Services
	if len(services) != 1 || services[0].Credentials != nil {
		t.Fatalf("snapshot lists services without their credentials: %+v", services)
	}
}

func TestAServiceSaysWhetherItHoldsAProcess(t *testing.T) {
	fake, _ := fixture(t)
	catalog := modules.NewRegistry()
	catalog.Register(modtest.Passing{ID: "db.redis", Package: "redis-server", Unit: "redis-server", Port: 6379})
	catalog.Register(modtest.Passing{ID: "runtime.node"})
	fake.Packages["redis-server"] = "7.0.15"
	fake.Packages["runtime-node"] = "22.11.0"
	fake.Units["redis-server"] = modtest.UnitActive
	reader := newReader(t, fake, catalog, func(time.Duration) {})

	runs := map[string]bool{}
	for _, service := range reader.Snapshot().Services {
		runs[service.ID] = service.Runs
	}
	if !runs["db.redis"] || runs["runtime.node"] {
		t.Fatalf("runs is the manifest's own answer, got %v", runs)
	}

	status, err := reader.ServiceStatus("runtime.node")
	if err != nil {
		t.Fatal(err)
	}
	if status.Runs {
		t.Fatal("service.status must agree with the snapshot")
	}
}

func TestAServiceNamesTheAccountItsManifestDeclares(t *testing.T) {
	fake, _ := fixture(t)
	catalog := modules.NewRegistry()
	catalog.Register(modtest.Passing{ID: "exposure.tunnel", Package: "tunnel", Unit: "tunnel", Connection: contract.ConnectionCloudflare})
	catalog.Register(modtest.Passing{ID: "db.redis", Package: "redis-server", Unit: "redis-server"})
	fake.Packages["tunnel"] = "2025.1.0"
	fake.Packages["redis-server"] = "7.0.15"
	fake.Units["tunnel"] = modtest.UnitActive
	fake.Units["redis-server"] = modtest.UnitActive
	reader := newReader(t, fake, catalog, func(time.Duration) {})

	connections := map[string]string{}
	for _, service := range reader.Snapshot().Services {
		connections[service.ID] = service.Connection
	}
	if connections["exposure.tunnel"] != contract.ConnectionCloudflare || connections["db.redis"] != "" {
		t.Fatalf("connection is the manifest's own answer, got %v", connections)
	}
}

func TestServiceStatusRefusesWhatIsNotInstalled(t *testing.T) {
	fake, _ := fixture(t)
	catalog := modules.NewRegistry()
	catalog.Register(modtest.Passing{ID: "db.redis"})

	if _, err := newReader(t, fake, catalog, nil).ServiceStatus("db.redis"); err == nil {
		t.Fatal("a module that is not installed has no status")
	}

	_, err := newReader(t, fake, catalog, nil).ServiceStatus("db.ghost")
	if code(t, err) != contract.ErrorServiceNotFound {
		t.Fatalf("got %v", err)
	}
}

func TestUrlPrefersTheTunnelWhenTheMachineHasADomain(t *testing.T) {
	fake, reader := fixture(t)

	address, err := reader.URL("web")
	if err != nil {
		t.Fatal(err)
	}
	if address != "http://127.0.0.1:3000" {
		t.Fatalf("with no domain the local address is the only true one: %s", address)
	}

	fake.Files["/etc/pupitre/env"] = []byte("PUPITRE_DOMAIN=dev.example.org\n")
	if address, _ = reader.URL("web"); address != "https://web.dev.example.org" {
		t.Fatalf("got %s", address)
	}
}

func TestInstallRunsTheDerivedCommandInTheProjectFolder(t *testing.T) {
	fake, reader := fixture(t)

	installed, err := reader.Install(context.Background(), "web", "", func(string) {})
	if err != nil {
		t.Fatal(err)
	}
	if len(installed) != 1 || installed[0].Process != "web" || installed[0].Command != "bun install" {
		t.Fatalf("got %+v", installed)
	}

	last := fake.Calls[len(fake.Calls)-1]
	if last.User != "dev" || last.Dir != "/home/dev/projects/web" {
		t.Fatalf("the install runs as dev in the project's folder: %+v", last)
	}
	if strings.Join(last.Argv, " ") != "zsh -lc bun install" {
		t.Fatalf("the declared line travels as one word: %+v", last.Argv)
	}
}

func TestDebugRestartsTheProjectUnderTheDeclaredPort(t *testing.T) {
	fake, reader := fixture(t)
	fake.Files["/etc/pupitre/env"] = []byte("PUPITRE_DEBUG_PORTS=\"web/web:5005 api/api:5006\"\n")

	if _, err := reader.Up("web", ""); err != nil {
		t.Fatal(err)
	}

	debug, err := reader.Debug("web", "web")
	if err != nil {
		t.Fatal(err)
	}

	if err := contract.ValidateValue("ProjectDebugResult", debug); err != nil {
		t.Fatalf("the result violates the contract: %v", err)
	}
	if debug.DebugPort != 5005 || debug.Port != 3000 || debug.State != contract.ProcessOnline {
		t.Fatalf("unexpected result: %+v", debug)
	}

	sent := strings.Join(fake.Commands(), "\n")
	if !strings.Contains(sent, "bun run dev --port 3000 -PdebugPort=5005") {
		t.Fatalf("the debug agent must be passed to the project's own command:\n%s", sent)
	}
}

func TestDebugRefusesAProjectTheMachineDeclaresNoPortFor(t *testing.T) {
	fake, reader := fixture(t)
	fake.Files["/etc/pupitre/env"] = []byte("PUPITRE_DEBUG_PORTS=\"api/api:5006\"\n")

	_, err := reader.Debug("web", "web")

	if got := code(t, err); got != contract.ErrorBadRequest {
		t.Fatalf("got %v", got)
	}
	if _, opened := fake.Windows["web/web"]; opened {
		t.Fatal("a refused debug must leave the project exactly as it was")
	}
}

func TestDebugLeavesTheServiceRowsToSystemd(t *testing.T) {
	fake, reader := fixture(t)
	fake.Files["/etc/pupitre/env"] = []byte("PUPITRE_DEBUG_PORTS=\"shots/shots:5005\"\n")

	_, err := reader.Debug("shots", "shots")

	if got := code(t, err); got != contract.ErrorBadRequest {
		t.Fatalf("got %v", got)
	}
}

func TestAnUnknownProjectIsRefusedEverywhere(t *testing.T) {
	_, reader := fixture(t)

	_, upErr := reader.Up("ghost", "")
	_, downErr := reader.Down("ghost", "")
	_, logsErr := reader.Logs("ghost", "ghost", 0)
	_, urlErr := reader.URL("ghost")
	_, removeErr := reader.Remove("ghost")
	_, debugErr := reader.Debug("ghost", "ghost")
	_, processErr := reader.Up("web", "ghost")

	for label, err := range map[string]error{"up": upErr, "down": downErr, "logs": logsErr, "url": urlErr, "remove": removeErr, "debug": debugErr, "process": processErr} {
		if got := code(t, err); got != contract.ErrorProjectNotFound {
			t.Errorf("%s: got %v", label, got)
		}
	}
}

func projectOf(t *testing.T, projects []contract.Project, name string) contract.Project {
	t.Helper()

	for _, project := range projects {
		if project.Name == name {
			return project
		}
	}

	t.Fatalf("%s missing from %+v", name, projects)

	return contract.Project{}
}

func code(t *testing.T, err error) contract.ErrorCode {
	t.Helper()

	var failure *protocol.Error
	if !errors.As(err, &failure) {
		t.Fatalf("expected a protocol error, got %v", err)
	}

	return failure.Code
}

func TestAServiceIsUnconfiguredWhenTheEngineLeftItForLater(t *testing.T) {
	fake, _ := fixture(t)
	catalog := modules.NewRegistry()
	catalog.Register(modtest.Passing{ID: "db.redis", Package: "redis-server", Unit: "redis-server", EnvKey: "REDIS_PASSWORD", Port: 6379})
	catalog.Register(modtest.Passing{ID: "tool.demo"})
	fake.Packages["redis-server"] = "7.0.15"
	fake.Packages["tool-demo"] = "1.0"
	fake.Units["redis-server"] = modtest.UnitActive

	reader := state.New(state.Options{
		Sys:          fake,
		Now:          modtest.NewClock(time.Millisecond).Now,
		Registry:     catalog,
		Entitlement:  func() contract.Entitlement { return contract.EntitlementDev },
		AgentVersion: "0.0.0-test",
		Deferred:     func() []string { return []string{"tool.demo"} },
	})

	configured := map[string]bool{}
	for _, service := range reader.Snapshot().Services {
		configured[service.ID] = service.Configured
	}
	if !configured["db.redis"] || configured["tool.demo"] {
		t.Fatalf("configured says what the engine left for later, got %v", configured)
	}

	status, err := reader.ServiceStatus("tool.demo")
	if err != nil {
		t.Fatal(err)
	}
	if status.Configured {
		t.Fatal("service.status must agree with the snapshot")
	}

	// A reader without an engine behind it has nothing deferred to report.
	if _, reader = fixture(t); reader.Snapshot().Services == nil {
		t.Fatal("a snapshot always lists services")
	}
}

func TestAddHandsTheProjectFoldersToTheirUser(t *testing.T) {
	fake, reader := fixture(t)

	if _, err := reader.Add(declared("api", 5173, "bun run dev --port 5173")); err != nil {
		t.Fatal(err)
	}

	for _, dir := range []string{"/home/dev/projects", "/home/dev/projects/api"} {
		if !fake.Dirs[dir] || fake.Owners[dir] != "dev:dev" {
			t.Fatalf("%s must exist and belong to dev, got exists=%v owner=%q", dir, fake.Dirs[dir], fake.Owners[dir])
		}
	}
}

// A repository that freezes --host react-box.localhost binds to a name the machine does not resolve: the agent makes it answer, in IPv4 only, where the port is probed and the tunnel knocks.
func TestAddPointsALocalhostHostAtTheLoopbackAndRemoveForgetsIt(t *testing.T) {
	fake, reader := fixture(t)
	fake.Files["/etc/hosts"] = []byte("127.0.0.1 localhost\n::1 localhost ip6-localhost\n")

	for at, one := range []struct{ name, host string }{{"shop", "shop.localhost"}, {"api", "127.0.0.1"}, {"box", "box.localhost"}} {
		project, processes := declared(one.name, 5173+at, "bun run dev")
		processes[0].Host = one.host
		if _, err := reader.Add(project, processes); err != nil {
			t.Fatal(err)
		}
	}

	want := "127.0.0.1 localhost\n::1 localhost ip6-localhost\n# >>> pupitre projects >>>\n127.0.0.1 box.localhost\n127.0.0.1 shop.localhost\n# <<< pupitre projects <<<\n"
	if got := string(fake.Files["/etc/hosts"]); got != want {
		t.Fatalf("/etc/hosts:\n%s\nwant:\n%s", got, want)
	}

	if _, err := reader.Remove("shop"); err != nil {
		t.Fatal(err)
	}

	want = "127.0.0.1 localhost\n::1 localhost ip6-localhost\n# >>> pupitre projects >>>\n127.0.0.1 box.localhost\n# <<< pupitre projects <<<\n"
	if got := string(fake.Files["/etc/hosts"]); got != want {
		t.Fatalf("/etc/hosts after remove:\n%s\nwant:\n%s", got, want)
	}

	out, processes := declared("out", 5180, "bun run dev")
	processes[0].Host = "shop.example.org"
	if _, err := reader.Add(out, processes); err == nil {
		t.Fatal("a host that is neither the loopback nor a .localhost name must be refused")
	}
}

// A folder a previous agent created as root would refuse the clone git runs as dev: it changes hands first.
func TestSyncHandsARootOwnedFolderBackBeforeCloning(t *testing.T) {
	fake, reader := fixture(t)
	fake.Files[registry.DefaultConf] = []byte("api|api|https://github.com/me/api|none|127.0.0.1|5173|-|sleep 1\n")
	fake.Dirs["/home/dev/projects/api"] = true
	fake.Owners["/home/dev/projects/api"] = "root:root"

	synced, err := reader.Sync(context.Background(), "api", func(string) {})
	if err != nil {
		t.Fatal(err)
	}

	if !synced.Pulled || fake.Owners["/home/dev/projects/api"] != "dev:dev" {
		t.Fatalf("the folder must belong to dev before the clone: pulled=%v owner=%q", synced.Pulled, fake.Owners["/home/dev/projects/api"])
	}

	var clone sys.Command
	for _, call := range fake.Calls {
		if len(call.Argv) > 3 && call.Argv[0] == "git" && call.Argv[3] == "clone" {
			clone = call
		}
	}

	if clone.User != "dev" || clone.Argv[len(clone.Argv)-1] != "/home/dev/projects/api" {
		t.Fatalf("the clone runs as dev into the project folder, got %+v", clone)
	}
}

// What the install prints travels as it comes: a reader watching a sync sees the package manager at work, not a blank channel for minutes.
func TestInstallHandsTheOutputOverLineByLine(t *testing.T) {
	fake, reader := fixture(t)
	fake.Replies["zsh"] = "bun install v1.2.3\n42 packages installed\n"

	var lines []string
	if _, err := reader.Install(context.Background(), "web", "", func(line string) { lines = append(lines, line) }); err != nil {
		t.Fatal(err)
	}

	if strings.Join(lines, "|") != "bun install v1.2.3|42 packages installed" {
		t.Fatalf("got %q", lines)
	}
}

// A machine busy installing answers busy rather than racing: the second run
// would work the same directories as the first, whichever session sent it.
func lockedReader(t *testing.T, fake *modtest.FakeSys) (*state.Reader, func()) {
	t.Helper()

	path := filepath.Join(t.TempDir(), "project-install.lock")
	release, held, err := lock.Acquire(path)
	if err != nil || !held {
		t.Fatalf("the lock could not be taken: held=%v err=%v", held, err)
	}

	reader := state.New(state.Options{
		Sys:          fake,
		Now:          modtest.NewClock(time.Millisecond).Now,
		Registry:     modules.NewRegistry(),
		Entitlement:  func() contract.Entitlement { return contract.EntitlementDev },
		AgentVersion: "0.0.0-test",
		Follow:       state.FollowOptions{Sleep: func(time.Duration) {}},
		InstallLock:  path,
	})

	return reader, release
}

func TestAnInstallAlreadyRunningAnswersBusy(t *testing.T) {
	fake, _ := fixture(t)
	reader, release := lockedReader(t, fake)
	defer release()

	_, err := reader.Install(context.Background(), "web", "", func(string) {})

	refused, ok := err.(*protocol.Error)
	if !ok || refused.Code != contract.ErrorBusy {
		t.Fatalf("a second install must be refused as busy: %v", err)
	}
}

func TestAPullOnABusyMachineAnswersBusy(t *testing.T) {
	fake, _ := fixture(t)
	reader, release := lockedReader(t, fake)
	defer release()

	_, err := reader.Pull("web")

	refused, ok := err.(*protocol.Error)
	if !ok || refused.Code != contract.ErrorBusy {
		t.Fatalf("a pull against a running install must be refused as busy: %v", err)
	}
}

// The install ends with the channel that asked for it: a session cut mid-run
// leaves no twin behind on the machine.
type waitingSys struct {
	*modtest.FakeSys
}

func (w waitingSys) Stream(cmd sys.Command, emit func(string)) error {
	if cmd.Context == nil {
		return w.FakeSys.Stream(cmd, emit)
	}

	<-cmd.Context.Done()

	return errors.New("killed with its channel")
}

func TestTheInstallEndsWithTheChannelThatAskedForIt(t *testing.T) {
	fake, _ := fixture(t)
	path := filepath.Join(t.TempDir(), "project-install.lock")
	reader := state.New(state.Options{
		Sys:          waitingSys{fake},
		Now:          modtest.NewClock(time.Millisecond).Now,
		Registry:     modules.NewRegistry(),
		Entitlement:  func() contract.Entitlement { return contract.EntitlementDev },
		AgentVersion: "0.0.0-test",
		Follow:       state.FollowOptions{Sleep: func(time.Duration) {}},
		InstallLock:  path,
	})
	channel, cancel := context.WithCancel(context.Background())
	done := make(chan error)

	go func() {
		_, err := reader.Install(channel, "web", "", func(string) {})
		done <- err
	}()

	cancel()

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("an install killed with its channel reports the failure, not a success")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("the install kept running after its channel was cut")
	}
}

// The reader reads the values the machine remembers where the engine wrote them, not at a path of its own: an engine on another install.json is read on that one.
func TestTheReaderReadsTheModulesOnTheEnginesInstallFile(t *testing.T) {
	fake, _ := fixture(t)
	catalog := modules.NewRegistry()
	catalog.Register(modtest.Passing{ID: "db.demo", Unit: "demo", Versioned: true})
	fake.Packages["db-demo-"+modtest.OtherVersion] = "1.0"
	fake.Files["/srv/pupitre/install.json"] = []byte(`{"modules":["db.demo"],"config":{"db.demo":{"version":"` + modtest.OtherVersion + `"}}}`)

	engine := &modules.Engine{Registry: catalog, Sys: fake, InstallPath: "/srv/pupitre/install.json", AgentVersion: "0.0.0-test"}
	reader := state.FromEngine(engine, state.Options{Follow: state.FollowOptions{Sleep: func(time.Duration) {}}})

	if _, err := reader.ServiceStatus("db.demo"); err != nil {
		t.Fatalf("the module installed on the remembered version must be found through the engine's install file: %v", err)
	}

	alone := state.New(state.Options{Sys: fake, Registry: catalog, Follow: state.FollowOptions{Sleep: func(time.Duration) {}}})
	if _, err := alone.ServiceStatus("db.demo"); err == nil {
		t.Fatal("a reader given no install file reads the default one, where nothing is remembered")
	}
}
