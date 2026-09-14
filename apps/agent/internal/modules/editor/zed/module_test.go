package zed

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
)

const latestRedirect = "https://github.com/zed-industries/zed/releases/download/v1.18.1/zed-remote-server-linux-x86_64.gz"

func newContext(t *testing.T, fake *modtest.FakeSys, values modtest.Values) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Values: values})
}

func machine() *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Users["dev"] = "/home/dev"
	fake.Answer("redirect_url", latestRedirect)
	fake.Replies["curl"] = "\x1f\x8b compressed binary"

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

func TestTheRemoteServerLandsWhereZedLooksForIt(t *testing.T) {
	fake := machine()

	install(t, fake, modtest.Values{"version": "latest"})

	binary := ServerDir + "/zed-remote-server-stable-1.18.1"
	if len(fake.Files[binary]) == 0 {
		t.Fatalf("Zed expects %s, files: %v", binary, fake.Files)
	}

	if len(fake.Files[binary+".gz"]) != 0 {
		t.Fatal("the compressed download must not stay behind")
	}

	if fake.Modes[binary] != 0o755 || fake.Owners[binary] != "dev:dev" {
		t.Fatalf("the server must be executable by dev, mode %o owner %q", fake.Modes[binary], fake.Owners[binary])
	}
}

func TestAPinnedVersionIsDownloadedAsAsked(t *testing.T) {
	fake := machine()

	install(t, fake, modtest.Values{"version": "1.17.4"})

	commands := strings.Join(fake.Commands(), "\n")
	if !strings.Contains(commands, "https://zed.dev/api/releases/stable/1.17.4/zed-remote-server-linux-") {
		t.Fatalf("a pinned version is fetched without resolving anything:\n%s", commands)
	}

	if strings.Contains(commands, "redirect_url") {
		t.Fatalf("only latest needs the redirect resolved:\n%s", commands)
	}

	if len(fake.Files[ServerDir+"/zed-remote-server-stable-1.17.4"]) == 0 {
		t.Fatal("the pinned server must be there")
	}
}

func TestReplayMutatesNothing(t *testing.T) {
	fake := machine()
	install(t, fake, modtest.Values{"version": "latest"})

	fake.Mutations = nil
	ctx := install(t, fake, modtest.Values{"version": "latest"})

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine:\n  %s", strings.Join(fake.Mutations, "\n  "))
	}

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}
}

// A release published since the install is not what a replay costs: the server it has stays, upgrade is what moves it.
func TestAReplayKeepsTheInstalledVersionAndUpgradeMovesIt(t *testing.T) {
	fake := machine()
	install(t, fake, modtest.Values{"version": "latest"})

	fake.Answer("redirect_url", strings.Replace(latestRedirect, "v1.18.1", "v1.19.0", 1))
	fake.Mutations = nil

	ctx := install(t, fake, modtest.Values{"version": "latest"})

	if len(fake.Mutations) != 0 || len(fake.Files[ServerDir+"/zed-remote-server-stable-1.19.0"]) != 0 {
		t.Fatalf("a replay must not fetch a newer server: %v", fake.Mutations)
	}

	if strings.TrimSpace(string(fake.Files[pointerPath])) != "1.18.1" {
		t.Fatalf("the record must still name the installed version: %q", fake.Files[pointerPath])
	}

	if err := (Module{}).Upgrade(ctx); err != nil {
		t.Fatal(err)
	}

	if len(fake.Files[ServerDir+"/zed-remote-server-stable-1.19.0"]) == 0 || strings.TrimSpace(string(fake.Files[pointerPath])) != "1.19.0" {
		t.Fatalf("upgrade must lay the newer server and record it: %q", fake.Files[pointerPath])
	}
}

func TestStatusNamesTheInstalledVersion(t *testing.T) {
	fake := machine()
	install(t, fake, modtest.Values{"version": "latest"})

	status, err := (Module{}).Status(newContext(t, fake, modtest.Values{"version": "latest"}))
	if err != nil {
		t.Fatal(err)
	}

	if !status.Installed || !status.Configured || status.Version != "1.18.1" {
		t.Fatalf("unexpected status: %+v", status)
	}
}

func TestUninstallTakesBackTheServerOnly(t *testing.T) {
	fake := machine()
	install(t, fake, modtest.Values{"version": "latest"})
	fake.Files[ServerDir+"/zed-remote-server-stable-0.9.9"] = []byte("placed by the client")

	if err := (Module{}).Uninstall(newContext(t, fake, modtest.Values{"version": "latest"})); err != nil {
		t.Fatal(err)
	}

	if len(fake.Files[ServerDir+"/zed-remote-server-stable-1.18.1"]) != 0 || len(fake.Files[pointerPath]) != 0 {
		t.Fatal("the server and its record go with the module")
	}

	if len(fake.Files[ServerDir+"/zed-remote-server-stable-0.9.9"]) == 0 {
		t.Fatal("a server the client put there is not the module's to remove")
	}
}

func TestAnUnreachableReleaseCarriesItsReplayCommand(t *testing.T) {
	fake := machine()
	fake.Answers = map[string]string{}
	fake.FailProgram("curl", "curl: (6) Could not resolve host: zed.dev")

	err := (Module{}).Install(newContext(t, fake, modtest.Values{"version": "latest"}))
	if err == nil {
		t.Fatal("expected the install to fail")
	}

	step, ok := err.(*modules.StepError)
	if !ok || step.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected error: %#v", err)
	}
}

var _ modules.Module = Module{}
