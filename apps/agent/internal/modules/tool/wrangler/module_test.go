package wrangler

import (
	"errors"
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys/env"
)

const (
	token   = "cf_s3cret-de-test"
	account = "407880e9a2f71d528020f4201d604548"
)

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{
		Manifest: manifest(),
		Values:   modtest.Values{"account_id": account},
		Secrets:  modtest.Secrets{"api_token": token},
	})
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

func configuredMachine() *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Files[mise.Path] = []byte("mise")
	fake.Tools[tool] = "4.131.1"
	fake.Files[env.Path] = []byte(tokenKey + "=" + token + "\n" + accountKey + "=" + account + "\n")
	fake.Files[shell.UserEnvPath] = []byte("export " + accountKey + "='" + account + "'\nexport " + tokenKey + "='" + token + "'\n")
	fake.Files[shell.EnvPath] = []byte("# >>> pupitre pupitre-env >>>\n[[ -r \"$HOME/.config/pupitre/env\" ]] && source \"$HOME/.config/pupitre/env\"\n# <<< pupitre pupitre-env <<<\n")

	return fake
}

// wrangler reads CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from its own shell: both land in root's file and in the dev shell.
func TestTheCliLandsAndTheTokenReachesTheDevShell(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, fake)

	if fake.Tools[tool] == "" {
		t.Fatalf("the CLI must be installed by mise: %v", fake.Tools)
	}

	if fake.EnvValue(tokenKey) != token || fake.EnvValue(accountKey) != account {
		t.Fatalf("root's file holds %q / %q", fake.EnvValue(tokenKey), fake.EnvValue(accountKey))
	}

	exported := string(fake.Files[shell.UserEnvPath])
	if !strings.Contains(exported, "export "+tokenKey+"='"+token+"'") || !strings.Contains(exported, "export "+accountKey+"='"+account+"'") {
		t.Fatalf("dev env = %q", exported)
	}

	if fake.Modes[shell.UserEnvPath] != 0o600 || fake.Owners[shell.UserEnvPath] != "dev:dev" {
		t.Fatalf("dev env: mode %o, owner %s", fake.Modes[shell.UserEnvPath], fake.Owners[shell.UserEnvPath])
	}

	status, err := (Module{}).Status(newContext(t, fake))
	if err != nil {
		t.Fatal(err)
	}

	if !status.Installed || !status.Configured || status.State != contract.ServiceRunning || status.Credentials["API token"] != tokenKey {
		t.Fatalf("status = %+v", status)
	}
}

func TestReplayMutatesNothing(t *testing.T) {
	fake := configuredMachine()

	ctx := run(t, fake)

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine:\n  %s", strings.Join(fake.Mutations, "\n  "))
	}
}

func TestSecretNeverLeaks(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := run(t, fake)

	for _, line := range ctx.Output() {
		if strings.Contains(line, token) {
			t.Fatalf("secret in output: %s", line)
		}
	}

	for _, call := range fake.Calls {
		if strings.Contains(strings.Join(call.Argv, " "), token) {
			t.Fatalf("the token never travels in argv: %v", call.Argv)
		}
	}
}

// The Cloudflare account belongs to the client: uninstalling gives back the CLI and the variables, nothing else.
func TestUninstallForgetsTheCliAndBothVariables(t *testing.T) {
	fake := configuredMachine()

	if err := (Module{}).Uninstall(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if fake.Tools[tool] != "" || fake.EnvValue(tokenKey) != "" || fake.EnvValue(accountKey) != "" {
		t.Fatalf("something survives: tools %v, env %q", fake.Tools, fake.Files[env.Path])
	}

	if _, kept := fake.Files[shell.UserEnvPath]; kept {
		t.Fatalf("the dev shell keeps a variable: %q", fake.Files[shell.UserEnvPath])
	}

	status, err := (Module{}).Status(newContext(t, fake))
	if err != nil || status.Installed {
		t.Fatalf("status = %+v, %v", status, err)
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

	var step *modules.StepError
	if !errors.As(err, &step) || step.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected error: %#v", err)
	}
}

// The token travels in the CLI's environment, never on its command line; the account named is the one the token deploys to.
func TestLoginAsksWranglerWhoamiWithTheTokenTheMachineHolds(t *testing.T) {
	bare := modtest.NewFakeSys()
	if got, asked := (Module{}).Login(newContext(t, bare)); !asked || got.State != contract.LoginSignedOut || got.Fix == "" {
		t.Fatalf("without a token the login is signed out with a fix: %+v (%v)", got, asked)
	}

	for _, line := range bare.Commands() {
		if strings.Contains(line, "whoami") {
			t.Fatalf("wrangler whoami ran without a token: %s", line)
		}
	}

	cases := map[string]struct {
		answer  string
		refused bool
		want    contract.Login
	}{
		"a user token": {
			answer: `{"loggedIn":true,"authType":"API Token","email":"jordan@example.org","accounts":[{"id":"` + account + `","name":"Flymate"}]}`,
			want:   contract.Login{State: contract.LoginSignedIn, Account: "jordan@example.org"},
		},
		"an account token": {
			answer: `{"loggedIn":true,"authType":"API Token","accounts":[{"id":"other","name":"Other"},{"id":"` + account + `","name":"Flymate"}]}`,
			want:   contract.Login{State: contract.LoginSignedIn, Account: "Flymate"},
		},
		"refused": {
			answer:  "",
			refused: true,
			want:    contract.Login{State: contract.LoginUnknown, Fix: "The Cloudflare account did not answer the key the machine holds: reconnect it in the app and apply this service's configuration."},
		},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			fake := configuredMachine()
			if tc.refused {
				fake.Refuse("wrangler whoami", tc.answer)
			} else {
				fake.Answer("wrangler whoami", tc.answer)
			}

			got, asked := (Module{}).Login(newContext(t, fake))
			if !asked || got != tc.want {
				t.Fatalf("login = %+v (%v), want %+v", got, asked, tc.want)
			}

			last := fake.Calls[len(fake.Calls)-1]
			if last.User != shell.User || strings.Join(last.Argv, " ") != "wrangler whoami --json" {
				t.Fatalf("the check runs as dev on the CLI's own command: %+v", last)
			}

			if !slices.Contains(last.Env, tokenKey+"="+token) || !slices.Contains(last.Env, accountKey+"="+account) {
				t.Fatalf("the variables travel in the environment: %v", last.Env)
			}
		})
	}
}

var _ modules.Module = Module{}

var _ modules.Account = Module{}
