package state_test

import (
	"errors"
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
	fake.Serves("web", 3000)

	return fake, newReader(t, fake, modules.NewRegistry(), func(time.Duration) {})
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

func TestAddThenUpBringsTheProjectOnlineAndDownStopsIt(t *testing.T) {
	fake, reader := fixture(t)
	fake.Serves("api", 5173)

	added, err := reader.Add(registry.Project{Name: "api", Dir: "api", PkgMgr: "bun", Host: "127.0.0.1", Port: 5173, Cmd: "bun run dev --port 5173"})
	if err != nil {
		t.Fatal(err)
	}
	if added.State != contract.ProjectStopped {
		t.Fatalf("a project that has just been declared is stopped, got %s", added.State)
	}

	up, err := reader.Up("api")
	if err != nil {
		t.Fatal(err)
	}
	if up.State != contract.ProjectOnline || up.Port != 5173 {
		t.Fatalf("unexpected result: %+v", up)
	}

	if got := projectOf(t, reader.Snapshot().Projects, "api"); got.State != contract.ProjectOnline || got.Port != 5173 {
		t.Fatalf("snapshot must show it online with its port: %+v", got)
	}

	fake.Files[tmux.Options{}.LogPath("api")] = append(fake.Files[tmux.Options{}.LogPath("api")], []byte("vite v7 ready in 412 ms\n")...)

	lines, err := reader.Logs("api", 1)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(lines, "") != "vite v7 ready in 412 ms" {
		t.Fatalf("project.logs must return the output: %q", lines)
	}

	down, err := reader.Down("api")
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

func TestSnapshotAnswersUnderThreeHundredMillisecondsWithTenProjects(t *testing.T) {
	fake := modtest.NewFakeSys()
	machine(fake)

	var rows strings.Builder
	for i := range 10 {
		name := string(rune('a'+i)) + "-app"
		port := 3000 + i
		rows.WriteString(name + "|" + name + "|-|bun|127.0.0.1|" + strconv.Itoa(port) + "|" + name + "|bun run dev --port " + strconv.Itoa(port) + "\n")
		fake.Dirs["/home/dev/projects/"+name] = true
		fake.Serves(name, port)
	}
	fake.Files[registry.DefaultConf] = []byte(rows.String())

	read := newReader(t, fake, modules.NewRegistry(), func(time.Duration) {})
	if _, err := read.Up(state.All); err != nil {
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

	if _, err := reader.Up(state.All); err != nil {
		t.Fatal(err)
	}

	if _, opened := fake.Windows["shots"]; opened {
		t.Fatal("a service row never gets a tmux window")
	}
	if _, opened := fake.Windows["web"]; !opened {
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
	fake.Serves("web", 3000)

	path := tmux.Options{}.LogPath("web")
	rounds := 0
	grow := func(time.Duration) {
		rounds++
		if rounds == 1 {
			fake.Files[path] = append(fake.Files[path], []byte("second\n")...)
		}
	}

	reader := newReader(t, fake, modules.NewRegistry(), grow)
	if _, err := reader.Up("web"); err != nil {
		t.Fatal(err)
	}
	fake.Files[path] = []byte("premier\n")

	var emitted []string
	if err := reader.Follow("web", 10, func(line string) { emitted = append(emitted, line) }); err != nil {
		t.Fatal(err)
	}

	if len(emitted) != 2 || emitted[0] != "premier" || emitted[1] != "second" {
		t.Fatalf("the tail comes first, then what follows: %q", emitted)
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

	command, err := reader.Install("web")
	if err != nil {
		t.Fatal(err)
	}
	if command != "bun install" {
		t.Fatalf("got %q", command)
	}

	last := fake.Calls[len(fake.Calls)-1]
	if last.User != "dev" || last.Dir != "/home/dev/projects/web" {
		t.Fatalf("the install runs as dev in the project's folder: %+v", last)
	}
	if strings.Join(last.Argv, " ") != "zsh -lc bun install" {
		t.Fatalf("the declared line travels as one word: %+v", last.Argv)
	}
}

func TestAnUnknownProjectIsRefusedEverywhere(t *testing.T) {
	_, reader := fixture(t)

	_, upErr := reader.Up("ghost")
	_, downErr := reader.Down("ghost")
	_, logsErr := reader.Logs("ghost", 0)
	_, urlErr := reader.URL("ghost")
	_, removeErr := reader.Remove("ghost")

	for label, err := range map[string]error{"up": upErr, "down": downErr, "logs": logsErr, "url": urlErr, "remove": removeErr} {
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
