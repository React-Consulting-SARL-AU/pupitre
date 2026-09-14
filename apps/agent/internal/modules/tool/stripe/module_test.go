package stripe

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/download"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/shell"
)

const (
	held    = "rk_test_s3cret-de-test"
	version = "1.50.11"
	newer   = "1.51.0"
)

func latestURL() string {
	return "https://github.com/stripe/stripe-cli/releases/latest/download/stripe-linux-checksums.txt"
}

func checksums(version string) string {
	return modtest.Digest(modtest.Downloaded) + "  " + release.Asset(version) + "\n"
}

// A machine whose GitHub answers version as the latest release, with the digest of what curl serves in the checksum document.
func machine(published string) *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Users["dev"] = "/home/dev"
	fake.Answer("-w %{redirect_url} "+latestURL(), "https://github.com/stripe/stripe-cli/releases/download/v"+published+"/stripe-linux-checksums.txt")

	for _, v := range []string{version, newer} {
		fake.Answer("releases/download/v"+v+"/stripe-linux-checksums.txt", checksums(v))
		fake.Archives[download.Dir+"/"+release.Asset(v)] = []string{Program}
	}

	return fake
}

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Secrets: modtest.Secrets{"api_key": held}})
}

func run(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	ctx := newContext(t, fake)

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	return ctx
}

func TestTheBinaryLandsCheckedAndTheTokenReachesTheDevShell(t *testing.T) {
	fake := machine(version)

	ctx := run(t, fake)

	if len(fake.Files[BinPath]) == 0 || fake.Owners[BinPath] != "" {
		t.Fatalf("the binary must be root's under /usr/local/bin: %v %q", fake.Files[BinPath], fake.Owners[BinPath])
	}

	if fake.EnvValue("STRIPE_API_KEY") != held {
		t.Fatal("the secret must be stored under root")
	}

	if !strings.Contains(string(fake.Files[shell.UserEnvPath]), "export STRIPE_API_KEY='"+held+"'") {
		t.Fatalf("the dev shell must export the secret:\n%s", fake.Files[shell.UserEnvPath])
	}

	for _, line := range ctx.Output() {
		if strings.Contains(line, held) {
			t.Fatalf("the secret leaked into the journal: %s", line)
		}
	}

	status, err := (Module{}).Status(newContext(t, fake))
	if err != nil {
		t.Fatal(err)
	}

	if !status.Installed || !status.Configured || status.Version != version {
		t.Fatalf("status = %+v", status)
	}
}

func TestReplayMutatesNothing(t *testing.T) {
	fake := machine(version)
	run(t, fake)

	fake.Mutations = nil
	ctx := run(t, fake)

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine:\n  %s", strings.Join(fake.Mutations, "\n  "))
	}

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}
}

func TestAWrongChecksumIsRefused(t *testing.T) {
	fake := machine(version)
	fake.Answer("releases/download/v"+version+"/stripe-linux-checksums.txt", strings.Repeat("0", 64)+"  "+release.Asset(version)+"\n")

	if err := (Module{}).Install(newContext(t, fake)); err == nil {
		t.Fatal("an archive whose digest is not the published one must be refused")
	}

	if _, kept := fake.Files[BinPath]; kept {
		t.Fatal("nothing must be installed")
	}
}

func TestUpgradeFollowsTheRelease(t *testing.T) {
	fake := machine(version)
	run(t, fake)

	fake.Answer("-w %{redirect_url} "+latestURL(), "https://github.com/stripe/stripe-cli/releases/download/v"+newer+"/stripe-linux-checksums.txt")

	if err := (Module{}).Upgrade(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if got := download.Recorded(newContext(t, fake), ID); got != newer {
		t.Fatalf("recorded version = %q, want %s", got, newer)
	}
}

func TestUninstallForgetsTheBinaryAndTheSecret(t *testing.T) {
	fake := machine(version)
	run(t, fake)

	if err := (Module{}).Uninstall(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if _, kept := fake.Files[BinPath]; kept || fake.EnvValue("STRIPE_API_KEY") != "" || strings.Contains(string(fake.Files[shell.UserEnvPath]), "STRIPE_API_KEY") {
		t.Fatal("the binary and the secret must go")
	}
}

func TestFailedInstallCarriesItsReplayCommand(t *testing.T) {
	fake := machine(version)
	fake.FailProgram("tar", "tar: Unexpected EOF in archive")

	err := (Module{}).Install(newContext(t, fake))
	if err == nil {
		t.Fatal("expected the install to fail")
	}

	step, ok := err.(*modules.StepError)
	if !ok || step.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected error: %#v", err)
	}
}

func TestLoginAsksTheCliWithTheSecretInItsEnvironment(t *testing.T) {
	fake := machine(version)

	got, asked := (Module{}).Login(newContext(t, fake))
	if !asked || got.State != contract.LoginSignedOut {
		t.Fatalf("without a secret the login is signed out: %+v", got)
	}

	run(t, fake)
	fake.Answer("stripe get /v1/account", `{"id":"acct_1","settings":{"dashboard":{"display_name":"Pupitre Studio"}}}`)

	got, _ = (Module{}).Login(newContext(t, fake))
	if got != (contract.Login{State: contract.LoginSignedIn, Account: "Pupitre Studio"}) {
		t.Fatalf("login = %+v", got)
	}

	last := fake.Calls[len(fake.Calls)-1]
	found := false
	for _, variable := range last.Env {
		found = found || variable == "STRIPE_API_KEY="+held
	}
	if !found || strings.Contains(strings.Join(last.Argv, " "), held) {
		t.Fatalf("the secret travels in the environment, never in argv: %+v", last)
	}

	delete(fake.Answers, "stripe get /v1/account")
	fake.Refuse("stripe get /v1/account", "Unauthorized\n")

	got, _ = (Module{}).Login(newContext(t, fake))
	if got.State != contract.LoginUnknown {
		t.Fatalf("a refused secret is unknown with a fix: %+v", got)
	}
}

var _ modules.Module = Module{}
var _ modules.Account = Module{}
