package neon

import (
	"slices"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/download"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys/env"
)

const key = "napi_s3cret-de-test"

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{
		Manifest: manifest(),
		Secrets:  modtest.Secrets{"api_key": key},
	})
}

// Every fake machine has the same binary stamp, so the version cache must not carry over between tests.
func machine() *modtest.FakeSys {
	known.Lock()
	known.stamp = ""
	known.Unlock()

	fake := modtest.NewFakeSys()
	fake.Answer("neon --version", "2.27.0\n")
	fake.Answer("-w %{redirect_url} https://github.com/neondatabase/neonctl/releases/latest/download/neonctl-linux-", "https://github.com/neondatabase/neonctl/releases/download/v2.27.0/neonctl-linux-"+nodeArch())
	fake.Answer("api.github.com/repos/neondatabase/neonctl/releases/tags/v2.27.0", `{"assets":[{"name":"neonctl-linux-`+nodeArch()+`","digest":"sha256:`+modtest.Digest(modtest.Downloaded)+`"}]}`)

	return fake
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

func TestTheCliLandsAndTheKeyIsStored(t *testing.T) {
	fake := machine()
	ctx := newContext(t, fake)

	run(t, ctx)

	commands := strings.Join(fake.Commands(), "\n")
	if !strings.Contains(commands, "neonctl-linux-") {
		t.Fatalf("the CLI was never downloaded:\n%s", commands)
	}

	if _, posed := fake.Files[BinaryPath]; !posed {
		t.Fatalf("no binary at %s", BinaryPath)
	}

	if fake.EnvValue(keyKey) != key {
		t.Fatalf("%s = %q", keyKey, fake.EnvValue(keyKey))
	}

	if fake.Links[LinkPath] != BinaryPath {
		t.Fatalf("neonctl must answer too: %v", fake.Links)
	}

	status, err := (Module{}).Status(ctx)
	if err != nil || !status.Installed || !status.Configured || status.Version != "2.27.0" {
		t.Fatalf("status = %+v, %v", status, err)
	}

	if err := contract.ValidateValue("ServiceStatusResult", status.Service(manifest())); err != nil {
		t.Fatal(err)
	}
}

func versionAsked(fake *modtest.FakeSys) int {
	asked := 0

	for _, command := range fake.Commands() {
		if command == BinaryPath+" --version" {
			asked++
		}
	}

	return asked
}

func TestTheVersionIsAskedOncePerBinary(t *testing.T) {
	fake := machine()
	run(t, newContext(t, fake))
	asked := versionAsked(fake)

	for range 3 {
		status, err := (Module{}).Status(newContext(t, fake))
		if err != nil || status.Version != "2.27.0" {
			t.Fatalf("status = %+v, %v", status, err)
		}
	}

	if versionAsked(fake) != asked+1 {
		t.Fatalf("the CLI was started %d times for its version", versionAsked(fake)-asked)
	}

	fake.Times[BinaryPath] = fake.Now.Add(time.Hour)
	fake.Answer("neon --version", "2.28.0\n")

	status, err := (Module{}).Status(newContext(t, fake))
	if err != nil || status.Version != "2.28.0" {
		t.Fatalf("a replaced binary must be asked again: %+v, %v", status, err)
	}
}

func TestNoStepTalksToTheNeonConsole(t *testing.T) {
	fake := machine()
	ctx := newContext(t, fake)

	run(t, ctx)

	if err := (Module{}).Upgrade(ctx); err != nil {
		t.Fatal(err)
	}

	for _, command := range fake.Commands() {
		if strings.Contains(command, "console.neon.tech") {
			t.Fatalf("the module called the Neon API: %s", command)
		}
	}
}

func TestTheKeyReachesTheDevShell(t *testing.T) {
	fake := machine()
	ctx := newContext(t, fake)

	run(t, ctx)

	if got := string(fake.Files[shell.UserEnvPath]); got != "export "+keyKey+"='"+key+"'\n" {
		t.Fatalf("dev env = %q", got)
	}

	if fake.Modes[shell.UserEnvPath] != 0o600 || fake.Owners[shell.UserEnvPath] != "dev:dev" {
		t.Fatalf("dev env: mode %o, owner %s", fake.Modes[shell.UserEnvPath], fake.Owners[shell.UserEnvPath])
	}

	if !strings.Contains(string(fake.Files[shell.EnvPath]), "source \"$HOME/.config/pupitre/env\"") {
		t.Fatalf(".zshenv never reads it: %q", fake.Files[shell.EnvPath])
	}
}

func TestKeyNeverLeaves(t *testing.T) {
	fake := machine()
	ctx := newContext(t, fake)

	run(t, ctx)

	for _, line := range ctx.Output() {
		if strings.Contains(line, key) {
			t.Fatalf("secret in output: %s", line)
		}
	}
}

func TestReplayOnAnEquippedMachineChangesNothing(t *testing.T) {
	fake := machine()
	run(t, newContext(t, fake))

	ctx := newContext(t, fake)
	run(t, ctx)

	for step, status := range statuses(ctx) {
		if status != contract.StepSkip {
			t.Errorf("replay: %s = %s, want skip", step, status)
		}
	}
}

func TestUninstallForgetsEveryNeonKey(t *testing.T) {
	fake := machine()
	ctx := newContext(t, fake)

	run(t, ctx)

	if err := fake.WriteFile("/etc/pupitre/env", []byte(keyKey+"="+key+"\nNEON_WEB_DATABASE_URL=postgresql://x\nGITHUB_TOKEN=gh\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := (Module{}).Uninstall(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	for _, line := range strings.Split(string(fake.Files["/etc/pupitre/env"]), "\n") {
		if strings.HasPrefix(line, keyPrefix) {
			t.Fatalf("a Neon key survived: %s", line)
		}
	}

	if fake.EnvValue("GITHUB_TOKEN") != "gh" {
		t.Fatal("the other keys of the machine are not ours to remove")
	}

	if _, posed := fake.Files[BinaryPath]; posed {
		t.Fatal("the binary must go with the module")
	}

	if _, linked := fake.Links[LinkPath]; linked {
		t.Fatal("the neonctl name must go with the binary")
	}

	if _, kept := fake.Files[shell.UserEnvPath]; kept {
		t.Fatalf("the dev shell keeps the key: %q", fake.Files[shell.UserEnvPath])
	}
}

func TestTheSecretIsRequiredByTheContract(t *testing.T) {
	held := func(string, string) []string { return nil }

	for _, field := range manifest().Fields {
		if field.Key != "api_key" {
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

	t.Fatalf("the manifest declares no api_key field")
}

var _ modules.Module = Module{}

func TestLoginNeverAsksNeonctlWithoutAKey(t *testing.T) {
	fake := machine()

	got, asked := (Module{}).Login(newContext(t, fake))
	if !asked || got.State != contract.LoginSignedOut || got.Fix == "" {
		t.Fatalf("login = %+v (%v)", got, asked)
	}

	for _, line := range fake.Commands() {
		if strings.Contains(line, " me") {
			t.Fatalf("neonctl me ran without a key: %s", line)
		}
	}
}

func TestLoginAsksNeonctlWithTheKeyTheMachineHolds(t *testing.T) {
	cases := map[string]struct {
		answer  string
		refused bool
		want    contract.Login
	}{
		"signed in": {
			answer: `{"login":"jordan","email":"jordan@example.org","plan":"free"}`,
			want:   contract.Login{State: contract.LoginSignedIn, Account: "jordan@example.org"},
		},
		"refused": {
			answer:  "INFO: Authentication failed, deleting credentials...\n",
			refused: true,
			want:    contract.Login{State: contract.LoginUnknown, Fix: "The Neon account did not answer the key the machine holds: reconnect it in the app and apply this service's configuration."},
		},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			fake := machine()
			fake.Files[env.Path] = []byte(keyKey + "=" + key + "\n")

			if tc.refused {
				fake.Refuse("neon me", tc.answer)
			} else {
				fake.Answer("neon me", tc.answer)
			}

			got, asked := (Module{}).Login(newContext(t, fake))
			if !asked || got != tc.want {
				t.Fatalf("login = %+v (%v), want %+v", got, asked, tc.want)
			}

			last := fake.Calls[len(fake.Calls)-1]
			if last.User != shell.User || strings.Join(last.Argv, " ") != BinaryPath+" me -o json" {
				t.Fatalf("the check runs as dev on the CLI's own command: %+v", last)
			}

			if !slices.Contains(last.Env, keyKey+"="+key) || strings.Contains(strings.Join(last.Argv, " "), key) {
				t.Fatalf("the key travels in the environment alone: %+v", last)
			}
		})
	}
}

func TestABinaryWhoseDigestDiffersIsRefused(t *testing.T) {
	fake := machine()
	fake.Answer("api.github.com/repos/neondatabase/neonctl/releases/tags/v2.27.0", `{"assets":[{"name":"neonctl-linux-`+nodeArch()+`","digest":"sha256:`+strings.Repeat("0", 64)+`"}]}`)

	err := (Module{}).Install(newContext(t, fake))
	if err == nil {
		t.Fatal("a digest that differs must fail the install")
	}

	if _, posed := fake.Files[BinaryPath]; posed {
		t.Fatal("the refused binary reached its destination")
	}
}

func TestUpgradeFetchesOnlyANewerRelease(t *testing.T) {
	fake := machine()
	run(t, newContext(t, fake))
	downloads := strings.Count(strings.Join(fake.Commands(), "\n"), "-o "+download.Dir+"/neonctl-linux-")

	if err := (Module{}).Upgrade(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if strings.Count(strings.Join(fake.Commands(), "\n"), "-o "+download.Dir+"/neonctl-linux-") != downloads {
		t.Fatal("the release on the machine must not be fetched again")
	}

	fake.Answer("-w %{redirect_url} https://github.com/neondatabase/neonctl/releases/latest/download/neonctl-linux-", "https://github.com/neondatabase/neonctl/releases/download/v2.28.0/neonctl-linux-"+nodeArch())
	fake.Answer("api.github.com/repos/neondatabase/neonctl/releases/tags/v2.28.0", `{"assets":[{"name":"neonctl-linux-`+nodeArch()+`","digest":"sha256:`+modtest.Digest(modtest.Downloaded)+`"}]}`)

	if err := (Module{}).Upgrade(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if strings.Count(strings.Join(fake.Commands(), "\n"), "-o "+download.Dir+"/neonctl-linux-") != downloads+1 {
		t.Fatal("a newer release must be fetched once")
	}
}
