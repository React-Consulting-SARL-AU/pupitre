package mailpit

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/download"
	"pupitre.studio/agent/internal/modules/modtest"
)

const (
	version = "1.31.1"
	newer   = "1.32.0"
)

func releaseDocument(digest string) string {
	return `{"assets":[{"name":"` + release.Asset("") + `","digest":"sha256:` + digest + `"}]}`
}

func machine(published string) *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Users["dev"] = "/home/dev"
	fake.Answer("-w %{redirect_url} https://github.com/axllent/mailpit/releases/latest/download/"+release.Asset(""), "https://github.com/axllent/mailpit/releases/download/v"+published+"/"+release.Asset(""))
	fake.Answer("api.github.com/repos/axllent/mailpit/releases/tags/v", releaseDocument(modtest.Digest(modtest.Downloaded)))
	fake.Archives[download.Dir+"/"+release.Asset("")] = []string{Program}

	return fake
}

func newContext(t *testing.T, fake *modtest.FakeSys, values modtest.Values) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Values: values})
}

func run(t *testing.T, fake *modtest.FakeSys, values modtest.Values) *modules.Context {
	t.Helper()

	ctx := newContext(t, fake, values)

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	return ctx
}

func TestFirstInstallLaysDownTheBinaryAndTheServiceOnTheLoopback(t *testing.T) {
	fake := machine(version)

	ctx := run(t, fake, modtest.Values{"smtp_port": 1025, "http_port": 8025})

	if len(fake.Files[BinPath]) == 0 {
		t.Fatal("the binary must land under /usr/local/bin")
	}

	unit := string(fake.Files[unitPath])

	for _, want := range []string{"--smtp 127.0.0.1:1025", "--listen 127.0.0.1:8025", "User=dev", "--database " + database} {
		if !strings.Contains(unit, want) {
			t.Errorf("the unit lacks %q:\n%s", want, unit)
		}
	}

	if fake.Units[Unit] != modtest.UnitActive {
		t.Fatal("the service must be enabled")
	}

	if fake.Owners[dataDir] != "dev:dev" {
		t.Errorf("the data folder belongs to dev, got %q", fake.Owners[dataDir])
	}

	status, err := (Module{}).Status(ctx)
	if err != nil {
		t.Fatal(err)
	}

	if !status.Installed || !status.Configured || status.Version != version || status.Port != 8025 || status.Unit != Unit {
		t.Fatalf("status = %+v", status)
	}
}

func TestReplayMutatesNothing(t *testing.T) {
	fake := machine(version)
	run(t, fake, modtest.Values{})

	fake.Mutations = nil
	ctx := run(t, fake, modtest.Values{})

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine:\n  %s", strings.Join(fake.Mutations, "\n  "))
	}

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}

	if fake.Restarts[Unit] != 1 {
		t.Fatalf("the service restarted %d times, once is the first start", fake.Restarts[Unit])
	}
}

func TestAChangedPortRewritesTheUnitAndRestarts(t *testing.T) {
	fake := machine(version)
	run(t, fake, modtest.Values{})

	run(t, fake, modtest.Values{"http_port": 8125})

	if !strings.Contains(string(fake.Files[unitPath]), "--listen 127.0.0.1:8125") || fake.Restarts[Unit] != 2 {
		t.Fatalf("unit = %s, restarts = %d", fake.Files[unitPath], fake.Restarts[Unit])
	}
}

func TestAWrongDigestIsRefused(t *testing.T) {
	fake := machine(version)
	fake.Answer("api.github.com/repos/axllent/mailpit/releases/tags/v", releaseDocument(strings.Repeat("0", 64)))

	if err := (Module{}).Install(newContext(t, fake, modtest.Values{})); err == nil {
		t.Fatal("an archive whose digest is not the published one must be refused")
	}
}

func TestUpgradeFollowsTheReleaseAndRestarts(t *testing.T) {
	fake := machine(version)
	run(t, fake, modtest.Values{})

	fake.Answer("-w %{redirect_url} https://github.com/axllent/mailpit/releases/latest/download/"+release.Asset(""), "https://github.com/axllent/mailpit/releases/download/v"+newer+"/"+release.Asset(""))

	if err := (Module{}).Upgrade(newContext(t, fake, modtest.Values{})); err != nil {
		t.Fatal(err)
	}

	if got := download.Recorded(newContext(t, fake, modtest.Values{}), ID); got != newer || fake.Restarts[Unit] != 2 {
		t.Fatalf("recorded = %q, restarts = %d", got, fake.Restarts[Unit])
	}
}

func TestUpgradeOnTheLatestReleaseLeavesTheServiceRunning(t *testing.T) {
	fake := machine(version)
	run(t, fake, modtest.Values{})

	ctx := newContext(t, fake, modtest.Values{})
	if err := (Module{}).Upgrade(ctx); err != nil {
		t.Fatal(err)
	}

	if fake.Restarts[Unit] != 1 {
		t.Fatalf("mailpit restarted %d time(s) without a new binary", fake.Restarts[Unit]-1)
	}

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("%s = %s, want skip", event.Step, event.Status)
		}
	}
}

func TestUninstallKeepsTheMessages(t *testing.T) {
	fake := machine(version)
	run(t, fake, modtest.Values{})
	fake.Files[database] = []byte("sqlite")

	if err := (Module{}).Uninstall(newContext(t, fake, modtest.Values{})); err != nil {
		t.Fatal(err)
	}

	if _, kept := fake.Files[BinPath]; kept || fake.Units[Unit] == modtest.UnitActive {
		t.Fatal("the binary and the unit must go")
	}

	if _, kept := fake.Files[unitPath]; kept {
		t.Fatal("the unit file must go")
	}

	if _, kept := fake.Files[database]; !kept {
		t.Fatal("the caught messages are the client's")
	}
}

func TestFailedInstallCarriesItsReplayCommand(t *testing.T) {
	fake := machine(version)
	fake.FailProgram("tar", "tar: Unexpected EOF in archive")

	err := (Module{}).Install(newContext(t, fake, modtest.Values{}))
	if err == nil {
		t.Fatal("expected the install to fail")
	}

	step, ok := err.(*modules.StepError)
	if !ok || step.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected error: %#v", err)
	}
}

var _ modules.Module = Module{}
