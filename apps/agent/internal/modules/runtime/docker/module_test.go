package docker

import (
	"encoding/json"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys"
)

var values = modtest.Values{"compose": true}

func newContext(t *testing.T, fake *modtest.FakeSys, chosen modtest.Values) *modules.Context {
	t.Helper()

	fake.Users[shell.User] = "/home/dev"

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Values: chosen})
}

func run(t *testing.T, ctx *modules.Context) {
	t.Helper()

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}
}

func statuses(ctx *modules.Context) map[string]contract.StepStatus {
	result := map[string]contract.StepStatus{}
	for _, event := range ctx.Events() {
		result[event.Step] = event.Status
	}

	return result
}

func TestInstallAddsTheRepositoryThenTheEngine(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, values)

	run(t, ctx)

	source := string(fake.Files[sourcePath])
	if !strings.Contains(source, "https://download.docker.com/linux/ubuntu") || !strings.Contains(source, keyringPath) {
		t.Fatalf("apt source = %q", source)
	}

	for _, pkg := range []string{enginePkg, composePkg, buildxPkg} {
		if fake.Packages[pkg] == "" {
			t.Errorf("%s not installed", pkg)
		}
	}

	config := string(fake.Files[configPath])
	if !strings.Contains(config, `"max-size": "10m"`) || !strings.Contains(config, `"live-restore": true`) || strings.Contains(config, "data-root") {
		t.Fatalf("daemon.json = %s", config)
	}

	status, err := (Module{}).Status(ctx)
	if err != nil || !status.Installed || !status.Configured || status.Unit != Unit {
		t.Fatalf("status = %+v, %v", status, err)
	}

	if err := contract.ValidateValue("ServiceStatusResult", status.Service(manifest())); err != nil {
		t.Fatal(err)
	}
}

// Without the group every docker command would need sudo, and the agents that run as dev would stop at the first one.
func TestDevJoinsTheDockerGroupOnce(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, values))

	found := false
	for _, joined := range fake.Groups[shell.User] {
		found = found || joined == group
	}
	if !found {
		t.Fatalf("dev groups = %v", fake.Groups[shell.User])
	}

	ctx := newContext(t, fake, values)
	run(t, ctx)

	if statuses(ctx)["join-docker-group"] != contract.StepSkip {
		t.Fatalf("steps = %v", statuses(ctx))
	}
}

func TestChosenDataRootAndLogSizeReachTheDaemon(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, modtest.Values{"compose": false, "data_root": "/srv/docker", "log_max_size": "50m"})

	run(t, ctx)

	config := string(fake.Files[configPath])
	if !strings.Contains(config, `"data-root": "/srv/docker"`) || !strings.Contains(config, `"max-size": "50m"`) {
		t.Fatalf("daemon.json = %s", config)
	}

	if fake.Packages[composePkg] != "" {
		t.Fatal("compose was not asked for")
	}
}

func TestReplayOnAnInstalledMachineChangesNothing(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, values))

	mutations := len(fake.Mutations)
	ctx := newContext(t, fake, values)
	run(t, ctx)

	for step, status := range statuses(ctx) {
		if status != contract.StepSkip {
			t.Errorf("replay: %s = %s, want skip", step, status)
		}
	}

	if len(fake.Mutations) != mutations {
		t.Fatalf("replay wrote to the machine: %v", fake.Mutations[mutations:])
	}
}

func TestFailedStepReportsItsReplayCommand(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailPackage(enginePkg, "E: Unable to locate package docker-ce")
	ctx := newContext(t, fake, values)

	if err := (Module{}).Install(ctx); err == nil {
		t.Fatal("expected install to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only=runtime.docker" {
		t.Fatalf("unexpected event: %+v", last)
	}
}

var _ modules.Module = Module{}

func TestPreflightRefusesToMoveTheDataRootUnderRunningContainers(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, values))
	fake.Answer("docker ps", "3f2a9c1d\n")

	ctx := modtest.NewContext(t, fake, modtest.Options{
		Manifest: manifest(),
		Values:   modtest.Values{"compose": true, "data_root": "/srv/docker"},
		Held:     modtest.Values{"compose": true, "data_root": ""},
	})
	problems := (Module{}).Preflight(ctx)
	if len(problems) != 1 || problems[0].Field != "data_root" || !strings.Contains(problems[0].Message, "docker stop") {
		t.Fatalf("problems = %+v", problems)
	}

	fake.Answer("docker ps", "\n")
	if problems := (Module{}).Preflight(ctx); len(problems) != 0 {
		t.Fatalf("nothing runs, the root may move: %+v", problems)
	}
}

func TestJoiningTheDockerGroupWarnsThatTerminalsMustBeReopened(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, values)

	run(t, ctx)

	if output := strings.Join(ctx.Output(), "\n"); !strings.Contains(output, "! dev just joined the docker group") {
		t.Fatalf("no warning about the open terminals:\n%s", output)
	}
}

// Docker's own iptables rules come before ufw's: a port published on every address would be open whatever the firewall says.
// "ip" only reaches the default bridge; the networks docker network create and compose make read default-network-opts.
func TestPublishedPortsBindToLoopbackOnEveryBridge(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, values))

	var config struct {
		IP                 string                       `json:"ip"`
		DefaultNetworkOpts map[string]map[string]string `json:"default-network-opts"`
	}
	if err := json.Unmarshal(fake.Files[configPath], &config); err != nil {
		t.Fatal(err)
	}

	if config.IP != "127.0.0.1" || config.DefaultNetworkOpts["bridge"]["com.docker.network.bridge.host_binding_ipv4"] != "127.0.0.1" {
		t.Fatalf("daemon.json = %s", fake.Files[configPath])
	}
}

const networksBeforeLoopback = `[
  {"Name": "bridge", "Driver": "bridge", "Options": {"com.docker.network.bridge.host_binding_ipv4": "0.0.0.0", "com.docker.network.bridge.name": "docker0"}},
  {"Name": "shop_default", "Driver": "bridge", "Options": {}},
  {"Name": "safe", "Driver": "bridge", "Options": {"com.docker.network.bridge.host_binding_ipv4": "127.0.0.1"}}
]`

const bridgeBeforeLoopback = `[
  {"Name": "bridge", "Driver": "bridge", "Options": {"com.docker.network.bridge.host_binding_ipv4": "0.0.0.0"}}
]`

const networksOnLoopback = `[
  {"Name": "bridge", "Driver": "bridge", "Options": {"com.docker.network.bridge.host_binding_ipv4": "127.0.0.1"}}
]`

const containersBeforeLoopback = `[
  {"Name": "/web", "HostConfig": {"PortBindings": {"80/tcp": [{"HostIp": "", "HostPort": "8086"}]}},
   "NetworkSettings": {"Ports": {"80/tcp": [{"HostIp": "0.0.0.0", "HostPort": "8086"}, {"HostIp": "::", "HostPort": "8086"}]}}},
  {"Name": "/admin", "HostConfig": {"PortBindings": {"80/tcp": [{"HostIp": "0.0.0.0", "HostPort": "8090"}]}},
   "NetworkSettings": {"Ports": {"80/tcp": [{"HostIp": "0.0.0.0", "HostPort": "8090"}]}}},
  {"Name": "/db", "HostConfig": {"PortBindings": {"5432/tcp": [{"HostIp": "", "HostPort": "5432"}]}},
   "NetworkSettings": {"Ports": {"5432/tcp": [{"HostIp": "127.0.0.1", "HostPort": "5432"}]}}}
]`

func dockerAnswers(fake *modtest.FakeSys, networks, running, containers string) {
	fake.Answer("docker network ls", "n1\nn2\nn3\n")
	fake.Answer("docker network inspect", networks)
	fake.Answer("docker ps", running)
	fake.Answer("docker inspect", containers)
}

const beforeLoopback = `{
  "live-restore": true,
  "log-driver": "json-file",
  "log-opts": {
    "max-file": "3",
    "max-size": "10m"
  }
}
`

// With containers running, dockerd keeps the bridge it had and every network keeps the options it was created with: the upgrade says which ports stay open, and how to close them.
func TestUpgradeNamesWhatStaysPublishedEverywhereAndHowToCloseIt(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, values))
	fake.Files[configPath] = []byte(beforeLoopback)
	dockerAnswers(fake, networksBeforeLoopback, "3f2a9c1d\n", containersBeforeLoopback)
	restarts := fake.Restarts[Unit]

	ctx := newContext(t, fake, values)
	if err := (Module{}).Upgrade(ctx); err != nil {
		t.Fatal(err)
	}

	if config := string(fake.Files[configPath]); !strings.Contains(config, "host_binding_ipv4") {
		t.Fatalf("daemon.json = %s", config)
	}

	if fake.Restarts[Unit] != restarts+1 {
		t.Fatalf("the daemon must restart once to read the new bind, restarts = %d", fake.Restarts[Unit]-restarts)
	}

	output := strings.Join(ctx.Output(), "\n")
	for _, want := range []string{"web (0.0.0.0:8086, [::]:8086)", "bridge, shop_default", "docker stop", "systemctl restart docker", "docker compose down", "docker compose up -d", "docker network rm"} {
		if !strings.Contains(output, want) {
			t.Errorf("the warning must say %q:\n%s", want, output)
		}
	}

	for _, spared := range []string{"admin", "8090", "safe", "5432"} {
		if strings.Contains(output, spared) {
			t.Errorf("%s is published on purpose or on the loopback, and must not be named:\n%s", spared, output)
		}
	}
}

// Nothing runs, so nothing is cut: the daemon is restarted onto the loopback bridge instead of being told about.
func TestAnIdleDaemonStillBoundEverywhereIsRestartedOntoTheLoopback(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, values))
	dockerAnswers(fake, bridgeBeforeLoopback, "", "[]")
	fake.Observe = func(cmd sys.Command) {
		if strings.Join(cmd.Argv, " ") == "systemctl restart docker" {
			fake.Answer("docker network inspect", networksOnLoopback)
		}
	}
	restarts := fake.Restarts[Unit]

	ctx := newContext(t, fake, values)
	run(t, ctx)

	if fake.Restarts[Unit] != restarts+1 || statuses(ctx)["check-published-ports"] != contract.StepOK {
		t.Fatalf("restarts = %d, steps = %v", fake.Restarts[Unit]-restarts, statuses(ctx))
	}

	if output := strings.Join(ctx.Output(), "\n"); strings.Contains(output, "docker network rm") {
		t.Fatalf("nothing is left to warn about:\n%s", output)
	}
}

func TestAForgedRepositoryKeyIsRefusedAndNotKept(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Signers[keyURL] = []string{"1111111111111111111111111111111111111111"}
	ctx := newContext(t, fake, values)

	err := (Module{}).Install(ctx)
	if err == nil || !strings.Contains(err.Error(), "1111111111111111111111111111111111111111") {
		t.Fatalf("install = %v, want the forged key named", err)
	}

	if _, kept := fake.Files[keyringPath]; kept {
		t.Fatal("a refused key must not stay where apt reads it")
	}

	if fake.Packages[enginePkg] != "" {
		t.Fatal("nothing is installed from a repository whose key was refused")
	}
}
