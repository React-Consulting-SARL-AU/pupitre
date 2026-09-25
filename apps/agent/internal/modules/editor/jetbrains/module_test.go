package jetbrains

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/download"
	"pupitre.studio/agent/internal/modules/modtest"
)

const releases = `{"IIU":[{"date":"2026-09-02","type":"release","version":"2026.2.2","build":"262.12345.67","downloads":{"linux":{"link":"https://download.jetbrains.com/idea/idea-2026.2.2.tar.gz","checksumLink":"https://download.jetbrains.com/idea/idea-2026.2.2.tar.gz.sha256"},"linuxARM64":{"link":"https://download.jetbrains.com/idea/idea-2026.2.2-aarch64.tar.gz","checksumLink":"https://download.jetbrains.com/idea/idea-2026.2.2-aarch64.tar.gz.sha256"}}}]}`

func newContext(t *testing.T, fake *modtest.FakeSys, values modtest.Values) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Values: values})
}

func machine(memTotalKB string) *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Users["dev"] = "/home/dev"
	fake.Files["/proc/meminfo"] = []byte("MemTotal:       " + memTotalKB + " kB\nMemFree: 1024 kB\n")
	fake.Answer("data.services.jetbrains.com", releases)
	fake.Archives[download.Dir+"/jetbrains-idea.tar.gz"] = []string{"bin/remote-dev-server.sh", "build.txt", "product-info.json"}

	return fake
}

func install(t *testing.T, fake *modtest.FakeSys, values modtest.Values) *modules.Context {
	t.Helper()

	ctx := newContext(t, fake, values)

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	for _, event := range ctx.Events() {
		if event.Status == contract.StepFail {
			t.Fatalf("step %s failed", event.Step)
		}
	}

	return ctx
}

func TestTheBackendLandsWhereGatewayLooksForIt(t *testing.T) {
	fake := machine("8388608")

	install(t, fake, modtest.Values{"ide": "idea", "version": "latest"})

	dist := "/home/dev/.cache/JetBrains/RemoteDev/dist/idea-latest"
	if !fake.Dirs[dist] {
		t.Fatalf("Gateway inspects %s, the fake machine holds %v", dist, fake.Dirs)
	}

	if !strings.Contains(strings.Join(fake.Commands(), "\n"), "https://download.jetbrains.com/idea/idea-2026.2.2") {
		t.Fatalf("the resolved release must be the one downloaded:\n%s", strings.Join(fake.Commands(), "\n"))
	}

	if string(fake.Files[dist+"/"+markerName]) != dist+"\n" {
		t.Fatalf("%s must mark the distribution as installed, got %q", markerName, fake.Files[dist+"/"+markerName])
	}

	if fake.Owners[dist+"/"+markerName] != "dev:dev" {
		t.Fatalf("the backend belongs to dev, got %q", fake.Owners[dist+"/"+markerName])
	}
}

func TestTheJVMIsSizedFromTheMachineMemory(t *testing.T) {
	for _, tc := range []struct {
		memTotalKB string
		heap       string
	}{
		{"2097152", "-Xmx1536m"},
		{"4194304", "-Xmx2048m"},
		{"8388608", "-Xmx4096m"},
		{"33554432", "-Xmx8192m"},
	} {
		fake := machine(tc.memTotalKB)

		install(t, fake, modtest.Values{"ide": "idea", "version": "latest"})

		options := string(fake.Files["/home/dev/.cache/JetBrains/RemoteDev/dist/idea-latest/bin/idea64.vmoptions"])
		if !strings.Contains(options, tc.heap) {
			t.Errorf("%s of RAM must give %s:\n%s", tc.memTotalKB, tc.heap, options)
		}
	}
}

func TestEachIDEHasItsOwnCodeAndOptionsFile(t *testing.T) {
	fake := machine("8388608")
	fake.Answer("data.services.jetbrains.com", strings.ReplaceAll(releases, "IIU", "GO"))
	fake.Archives[download.Dir+"/jetbrains-goland.tar.gz"] = []string{"build.txt"}

	install(t, fake, modtest.Values{"ide": "goland", "version": "2026.2"})

	commands := strings.Join(fake.Commands(), "\n")
	if !strings.Contains(commands, "code=GO") {
		t.Fatalf("GoLand is asked for by its own product code:\n%s", commands)
	}

	dist := "/home/dev/.cache/JetBrains/RemoteDev/dist/goland-2026.2"
	if len(fake.Files[dist+"/bin/goland64.vmoptions"]) == 0 {
		t.Fatalf("GoLand reads bin/goland64.vmoptions, files: %v", fake.Files)
	}
}

func TestReplayMutatesNothing(t *testing.T) {
	fake := machine("8388608")
	install(t, fake, modtest.Values{"ide": "idea", "version": "latest"})

	fake.Mutations = nil
	ctx := install(t, fake, modtest.Values{"ide": "idea", "version": "latest"})

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine:\n  %s", strings.Join(fake.Mutations, "\n  "))
	}

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}
}

func TestStatusReadsTheBuildThatIsOnTheMachine(t *testing.T) {
	fake := machine("8388608")
	install(t, fake, modtest.Values{"ide": "idea", "version": "latest"})
	fake.Files["/home/dev/.cache/JetBrains/RemoteDev/dist/idea-latest/build.txt"] = []byte("IU-262.12345.67\n")

	status, err := (Module{}).Status(newContext(t, fake, modtest.Values{"ide": "idea", "version": "latest"}))
	if err != nil {
		t.Fatal(err)
	}

	if !status.Installed || !status.Configured || status.Version != "IU-262.12345.67" {
		t.Fatalf("unexpected status: %+v", status)
	}

	if status.Path != "/home/dev/.cache/JetBrains/RemoteDev/dist/idea-latest" {
		t.Fatalf("the status must name the backend Gateway is pointed at, got %q", status.Path)
	}
}

func TestUninstallGivesBackTheCacheOnly(t *testing.T) {
	fake := machine("8388608")
	install(t, fake, modtest.Values{"ide": "idea", "version": "latest"})

	if err := (Module{}).Uninstall(newContext(t, fake, modtest.Values{"ide": "idea", "version": "latest"})); err != nil {
		t.Fatal(err)
	}

	dist := "/home/dev/.cache/JetBrains/RemoteDev/dist/idea-latest"
	if fake.Dirs[dist] || len(fake.Files[dist+"/"+markerName]) != 0 {
		t.Fatal("the backend must go with the module")
	}

	if !fake.Dirs["/home/dev/.cache/JetBrains/RemoteDev/dist"] {
		t.Fatal("the dist folder belongs to Gateway, not to the module")
	}
}

func TestAnUnreachableReleaseIndexCarriesItsReplayCommand(t *testing.T) {
	fake := machine("8388608")
	fake.Answers = map[string]string{}
	fake.FailProgram("curl", "curl: (6) Could not resolve host: data.services.jetbrains.com")

	err := (Module{}).Install(newContext(t, fake, modtest.Values{"ide": "idea", "version": "latest"}))
	if err == nil {
		t.Fatal("expected the install to fail")
	}

	step, ok := err.(*modules.StepError)
	if !ok || step.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected error: %#v", err)
	}
}

var _ modules.Module = Module{}

func TestAFailedDownloadLeavesNoDistribution(t *testing.T) {
	fake := machine("8388608")
	fake.FailProgram("tar", "tar: Unexpected EOF in archive")

	err := (Module{}).Install(newContext(t, fake, modtest.Values{"ide": "idea", "version": "latest"}))
	if err == nil {
		t.Fatal("expected the install to fail")
	}

	for path := range fake.Dirs {
		if strings.HasPrefix(path, CacheDir+"/idea-") {
			t.Fatalf("a folder stayed behind: %s", path)
		}
	}

	delete(fake.Failures, "tar")
	ctx := install(t, fake, modtest.Values{"ide": "idea", "version": "latest"})

	if fake.Files[CacheDir+"/idea-latest/build.txt"] == nil {
		t.Fatalf("the replay must download for real: %v", ctx.Events())
	}
}

func TestAnEmptyDistributionIsNotABackend(t *testing.T) {
	fake := machine("8388608")
	fake.Dirs[CacheDir+"/idea-latest"] = true

	if status, err := (Module{}).Check(newContext(t, fake, modtest.Values{"ide": "idea", "version": "latest"})); err != nil || status.Installed {
		t.Fatalf("status = %+v, %v", status, err)
	}

	install(t, fake, modtest.Values{"ide": "idea", "version": "latest"})

	if fake.Files[CacheDir+"/idea-latest/build.txt"] == nil {
		t.Fatal("the backend must be downloaded into the empty folder")
	}
}

func TestUpgradeDownloadsBeforeRemovingTheRunningBackend(t *testing.T) {
	fake := machine("8388608")
	install(t, fake, modtest.Values{"ide": "idea", "version": "latest"})
	fake.Files[CacheDir+"/idea-latest/build.txt"] = []byte("IU-261.1.1\n")

	removedAt, downloadedAt := -1, -1
	fake.Mutations = nil
	if err := (Module{}).Upgrade(newContext(t, fake, modtest.Values{"ide": "idea", "version": "latest"})); err != nil {
		t.Fatal(err)
	}

	for at, mutation := range fake.Mutations {
		if mutation == "remove "+CacheDir+"/idea-latest" && removedAt < 0 {
			removedAt = at
		}

		if strings.HasPrefix(mutation, "write "+CacheDir+"/idea-latest.partial/") && downloadedAt < 0 {
			downloadedAt = at
		}
	}

	if downloadedAt < 0 || removedAt < 0 || downloadedAt > removedAt {
		t.Fatalf("download at %d, removal at %d:\n  %s", downloadedAt, removedAt, strings.Join(fake.Mutations, "\n  "))
	}

	if string(fake.Files[CacheDir+"/idea-latest/build.txt"]) != "extrait de "+download.Dir+"/jetbrains-idea.tar.gz" {
		t.Fatal("the new backend must stand where Gateway looks")
	}
}

func TestUninstallRemovesEveryDistributionTheModuleLaid(t *testing.T) {
	fake := machine("8388608")
	install(t, fake, modtest.Values{"ide": "idea", "version": "latest"})
	fake.Answer("data.services.jetbrains.com", strings.ReplaceAll(releases, "IIU", "GO"))
	fake.Archives[download.Dir+"/jetbrains-goland.tar.gz"] = []string{"build.txt"}
	install(t, fake, modtest.Values{"ide": "goland", "version": "2026.2"})
	fake.Dirs[CacheDir+"/9c2d1a-IU-262.12345.67"] = true
	fake.Files[CacheDir+"/9c2d1a-IU-262.12345.67/build.txt"] = []byte("IU-262.12345.67\n")

	if err := (Module{}).Uninstall(newContext(t, fake, modtest.Values{"ide": "goland", "version": "2026.2"})); err != nil {
		t.Fatal(err)
	}

	for _, dist := range []string{CacheDir + "/idea-latest", CacheDir + "/goland-2026.2"} {
		if fake.Dirs[dist] {
			t.Errorf("%s stayed", dist)
		}
	}

	if !fake.Dirs[CacheDir+"/9c2d1a-IU-262.12345.67"] {
		t.Fatal("a distribution Gateway downloaded itself is Gateway's")
	}
}
