package github

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/shell"
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
	fake.Answer("gh api user", "flyleaf")
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

func TestARotatedTokenSignsGhInAgain(t *testing.T) {
	fake := configuredMachine()
	ctx := newContext(t, fake, modtest.Secrets{"token": "n3w-token"})

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	signedIn := false

	for _, call := range fake.Calls {
		if strings.Join(call.Argv, " ") == "gh auth login --with-token" {
			signedIn = string(call.Stdin) == "n3w-token\n"
		}
	}

	if !signedIn || fake.EnvValue(envKey) != "n3w-token" {
		t.Fatalf("gh must sign in again with the new token: %v", fake.Commands())
	}
}

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

func TestTheSecretIsRequiredByTheContract(t *testing.T) {
	held := func(string, string) []string { return nil }

	for _, field := range manifest().Fields {
		if field.Key != "token" {
			continue
		}

		problem := contract.ValidateField(ID, field, nil, held)
		if problem == nil || problem.Code != contract.ProblemRequired {
			t.Fatalf("problem = %+v", problem)
		}

		if problem.Message == "" {
			t.Fatal("a refusal says what is wrong")
		}

		return
	}

	t.Fatalf("the manifest declares no token field")
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
	fake.Files[hostsPath] = []byte("github.com:\n    oauth_token: " + token + "\n    user: flyleaf\n")
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

	commands := strings.Join(fake.Commands(), "\n")
	if !strings.Contains(commands, "(dev) gh auth logout --hostname github.com") || !strings.Contains(commands, "(dev) git config --global --unset-all "+helperKey) {
		t.Fatalf("gh must be signed out and git's helper unset before gh goes:\n%s", commands)
	}

	removeAt, logoutAt := strings.Index(commands, "apt-get"), strings.Index(commands, "gh auth logout")
	if logoutAt < 0 || removeAt >= 0 && logoutAt > removeAt {
		t.Fatal("gh signs out while it is still there")
	}
}

func TestUninstallRemovesTheHostsFileWhenGhCannotSignOut(t *testing.T) {
	fake := configuredMachine()
	fake.Files[hostsPath] = []byte("github.com:\n    oauth_token: " + token + "\n")
	fake.FailProgram("gh", "failed to log out")
	ctx := newContext(t, fake, modtest.Secrets{"token": token})

	if err := (Module{}).Uninstall(ctx); err != nil {
		t.Fatal(err)
	}

	if _, kept := fake.Files[hostsPath]; kept {
		t.Fatal("the token stayed in hosts.yml")
	}

	if output := strings.Join(ctx.Output(), "\n"); !strings.Contains(output, "! gh could not sign out") || strings.Contains(output, token) {
		t.Fatalf("the client must be told, without the token:\n%s", output)
	}
}

var _ modules.Module = Module{}

func TestLoginReadsWhatGhAuthStatusSays(t *testing.T) {
	cases := map[string]struct {
		answer  string
		refused bool
		want    contract.Login
	}{
		"signed in": {
			answer: `{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"flyleaf","tokenSource":"GITHUB_TOKEN"}]}}`,
			want:   contract.Login{State: contract.LoginSignedIn, Account: "flyleaf"},
		},
		"nobody": {
			answer:  `{"hosts":{}}`,
			refused: true,
			want:    contract.Login{State: contract.LoginSignedOut, Fix: "Reconnect the GitHub account in the app and apply this service's configuration; or run gh auth login in a terminal on this server."},
		},
		"revoked": {
			answer:  `{"hosts":{"github.com":[{"state":"error","error":"non-200 OK status code: 401 Unauthorized","active":true,"host":"github.com","login":""}]}}`,
			refused: true,
			want:    contract.Login{State: contract.LoginSignedOut, Fix: "Reconnect the GitHub account in the app and apply this service's configuration; or run gh auth login in a terminal on this server."},
		},
		"unreachable": {
			answer:  `{"hosts":{"github.com":[{"state":"error","error":"dial tcp: lookup api.github.com: no such host","active":true,"host":"github.com","login":""}]}}`,
			refused: true,
			want:    contract.Login{State: contract.LoginUnknown, Fix: "gh did not answer its own check: read this service again in a moment, or run gh auth status in a terminal on this server."},
		},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			fake := configuredMachine()

			if tc.refused {
				fake.Refuse("gh auth status", tc.answer)
			} else {
				fake.Answer("gh auth status", tc.answer)
			}

			got, asked := (Module{}).Login(newContext(t, fake, modtest.Secrets{}))
			if !asked || got != tc.want {
				t.Fatalf("login = %+v (%v), want %+v", got, asked, tc.want)
			}

			last := fake.Calls[len(fake.Calls)-1]
			if last.User != shell.User || strings.Join(last.Argv, " ") != "gh auth status --active --json hosts" {
				t.Fatalf("the check runs as dev on gh's own command: %+v", last)
			}
		})
	}
}
