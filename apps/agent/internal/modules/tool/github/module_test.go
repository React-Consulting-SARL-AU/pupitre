package github

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys/env"
)

const token = "s3cret-de-test"

func newContext(t *testing.T, fake *modtest.FakeSys, secrets modtest.Secrets) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Secrets: secrets})
}

func configuredMachine() *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Packages[pkg] = "2.62.0"
	fake.Files[keyringPath] = []byte("keyring")
	fake.Files[sourcePath] = []byte(sourceLine())
	fake.Files[keyPath] = []byte("PRIVATE KEY")
	fake.Files[keyPath+".pub"] = []byte("ssh-ed25519 AAAA staging")
	fake.Files[env.Path] = []byte(envKey + "=" + token + "\n")
	fake.Answer("hostname", "staging")
	fake.Answer("gh api user", "flymate")
	fake.Answer("credential.https://github.com.helper", "!gh auth git-credential")
	fake.Answer("gh ssh-key list", "staging\tssh-ed25519 AAAA\t2026-09-04")

	return fake
}

func TestInstallAndConfigureAreIdempotent(t *testing.T) {
	fake := configuredMachine()
	ctx := newContext(t, fake, modtest.Secrets{"token": token})

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine: %v", fake.Mutations)
	}
}

// HTTPS through the token is what makes a clone work with no key on the account at all.
func TestConfigureAuthenticatesAndRegistersTheServerKey(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Packages[pkg] = "2.62.0"
	fake.Files[keyPath] = []byte("PRIVATE KEY")
	fake.Files[keyPath+".pub"] = []byte("ssh-ed25519 AAAA staging")
	fake.Answer("hostname", "staging")
	ctx := newContext(t, fake, modtest.Secrets{"token": token})

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	commands := strings.Join(fake.Commands(), "\n")
	for _, wanted := range []string{"gh auth login --with-token", "gh auth setup-git", "gh ssh-key add"} {
		if !strings.Contains(commands, wanted) {
			t.Fatalf("%q must run on a machine that has none of it:\n%s", wanted, commands)
		}
	}

	if fake.EnvValue(envKey) != token {
		t.Fatalf("the token belongs in %s", env.Path)
	}
}

func TestSecretNeverLeaks(t *testing.T) {
	fake := configuredMachine()
	ctx := newContext(t, fake, modtest.Secrets{"token": token})

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	for _, line := range ctx.Output() {
		if strings.Contains(line, token) {
			t.Fatalf("secret in output: %s", line)
		}
	}

	for _, call := range fake.Calls {
		if strings.Contains(strings.Join(call.Argv, " "), token) {
			t.Fatalf("the token travels on the standard input, never in argv: %v", call.Argv)
		}
	}
}

func TestConfigureWithoutTokenIsRefused(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Packages[pkg] = "2.62.0"
	ctx := newContext(t, fake, nil)

	failure, isProtocol := (Module{}).Configure(ctx).(*protocol.Error)
	if !isProtocol || failure.Code != contract.ErrorBadRequest {
		t.Fatalf("want bad_request, got %#v", failure)
	}
}

func TestFailedStepReportsReplay(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailPackage(pkg, "E: Unable to locate package gh")
	ctx := newContext(t, fake, modtest.Secrets{"token": token})

	if err := (Module{}).Install(ctx); err == nil {
		t.Fatal("expected install to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected event: %+v", last)
	}
}

func TestStatusCitesTheKeyNeverTheValue(t *testing.T) {
	fake := configuredMachine()
	ctx := newContext(t, fake, modtest.Secrets{"token": token})

	status, err := (Module{}).Status(ctx)
	if err != nil {
		t.Fatal(err)
	}

	if !status.Installed || !status.Configured {
		t.Fatalf("unexpected status: %+v", status)
	}

	for label, value := range status.Credentials {
		if value != envKey {
			t.Fatalf("%s must cite a key of %s, got %q", label, env.Path, value)
		}
	}
}

func TestUninstallLeavesTheServerKeyAlone(t *testing.T) {
	fake := configuredMachine()
	ctx := newContext(t, fake, modtest.Secrets{"token": token})

	if err := (Module{}).Uninstall(ctx); err != nil {
		t.Fatal(err)
	}

	if _, present := fake.Packages[pkg]; present {
		t.Fatal("gh must be removed")
	}

	if fake.EnvValue(envKey) != "" {
		t.Fatal("the token must leave /etc/pupitre/env")
	}

	if fake.Files[keyPath] == nil {
		t.Fatalf("%s belongs to the machine, not to this module", keyPath)
	}
}

var _ modules.Module = Module{}
