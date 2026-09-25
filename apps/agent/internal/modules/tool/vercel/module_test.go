package vercel

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/modules/runtime/shell"
)

const held = "vc_s3cret-de-test"

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Secrets: modtest.Secrets{"token": held}})
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

func TestTheCliLandsAndTheTokenReachesTheDevShell(t *testing.T) {
	fake := modtest.NewFakeSys()

	ctx := run(t, fake)

	if fake.Tools[tool] == "" {
		t.Fatalf("the CLI must be installed by mise: %v", fake.Tools)
	}

	if fake.EnvValue(tokenKey) != held {
		t.Fatal("the token must be stored under root")
	}

	if !strings.Contains(string(fake.Files[shell.UserEnvPath]), "export "+tokenKey+"='"+held+"'") {
		t.Fatalf("the dev shell must export the token:\n%s", fake.Files[shell.UserEnvPath])
	}

	for _, line := range ctx.Output() {
		if strings.Contains(line, held) {
			t.Fatalf("the token leaked into the journal: %s", line)
		}
	}

	status, err := (Module{}).Status(newContext(t, fake))
	if err != nil {
		t.Fatal(err)
	}

	if !status.Installed || !status.Configured || status.Credentials["Vercel token"] != tokenKey {
		t.Fatalf("status = %+v", status)
	}
}

func TestReplayMutatesNothing(t *testing.T) {
	fake := modtest.NewFakeSys()
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

func TestUninstallForgetsTheToken(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, fake)

	if err := (Module{}).Uninstall(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if fake.Tools[tool] != "" || fake.EnvValue(tokenKey) != "" || strings.Contains(string(fake.Files[shell.UserEnvPath]), tokenKey) {
		t.Fatal("the CLI and the token must go")
	}
}

func TestFailedInstallCarriesItsReplayCommand(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[mise.Path] = []byte("mise")
	fake.FailProgram("mise", "mise: npm backend unavailable")

	err := (Module{}).Install(newContext(t, fake))
	if err == nil {
		t.Fatal("expected the install to fail")
	}

	step, ok := err.(*modules.StepError)
	if !ok || step.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected error: %#v", err)
	}
}

func TestLoginReadsWhatVercelWhoamiSays(t *testing.T) {
	fake := modtest.NewFakeSys()

	got, asked := (Module{}).Login(newContext(t, fake))
	if !asked || got.State != contract.LoginSignedOut {
		t.Fatalf("without a token the login is signed out: %+v", got)
	}

	run(t, fake)
	fake.Answer("vercel whoami", "> jordan-monier\n")

	got, _ = (Module{}).Login(newContext(t, fake))
	if got != (contract.Login{State: contract.LoginSignedIn, Account: "jordan-monier"}) {
		t.Fatalf("login = %+v", got)
	}

	last := fake.Calls[len(fake.Calls)-1]
	found := false

	for _, variable := range last.Env {
		found = found || variable == tokenKey+"="+held
	}

	if !found || strings.Contains(strings.Join(last.Argv, " "), held) {
		t.Fatalf("the token travels in the environment, never in argv: %+v", last)
	}

	delete(fake.Answers, "vercel whoami")
	fake.Refuse("vercel whoami", "Error: The specified token is not valid.\n")

	got, _ = (Module{}).Login(newContext(t, fake))
	if got.State != contract.LoginUnknown {
		t.Fatalf("a refused token is unknown with a fix: %+v", got)
	}
}

var _ modules.Module = Module{}
var _ modules.Account = Module{}
