package cursor

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/ai/agents"
	"pupitre.studio/agent/internal/modules/download"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/shell"
)

const (
	version = "2026.09.10-fd3934a"
	newer   = "2026.09.20-0badc0de"
)

func installer(version string) string {
	return "#!/usr/bin/env bash\nDOWNLOAD_URL=\"https://downloads.cursor.com/lab/" + version + "/${OS}/${ARCH}/agent-cli-package.tar.gz\"\n"
}

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest()})
}

// A machine whose installer script names version, and whose tarball unpacks into the files Cursor ships.
func machine(published string) *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Users["dev"] = "/home/dev"
	fake.Answer("cursor.com/install", installer(published))

	for _, v := range []string{version, newer} {
		fake.Archives[download.Dir+"/"+Program+"-"+v+".tar.gz"] = []string{Program, "node", "index.js"}
	}

	return fake
}

func install(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	ctx := newContext(t, fake)

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

func TestFirstInstallLaysDownTheCliUnderItsVersionAndTheSkills(t *testing.T) {
	fake := machine(version)

	install(t, fake)

	if len(fake.Files[binaryPath(version)]) == 0 {
		t.Fatalf("the CLI must be unpacked under its version: %v", fake.Files)
	}

	for _, name := range []string{BinPath, LegacyPath} {
		if fake.Links[name] != binaryPath(version) {
			t.Errorf("%s must point at the versioned binary, got %q", name, fake.Links[name])
		}
	}

	if fake.Owners[binaryPath(version)] != "dev:dev" {
		t.Errorf("the CLI belongs to dev, got %q", fake.Owners[binaryPath(version)])
	}

	for _, path := range []string{
		agents.SkillsDir + "/capture/SKILL.md",
		configDir + "/skills/ship/SKILL.md",
	} {
		if len(fake.Files[path]) == 0 {
			t.Errorf("%s was not laid down", path)
		}
	}

	if _, written := fake.Files[configDir+"/AGENTS.md"]; written {
		t.Error("Cursor reads no global context file, none must be written")
	}

	if !strings.Contains(string(fake.Files[shell.EnvPath]), shell.LocalBin) {
		t.Errorf("~/.local/bin must reach the path of every shell:\n%s", fake.Files[shell.EnvPath])
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
	install(t, fake)

	fake.Mutations = nil
	ctx := install(t, fake)

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine:\n  %s", strings.Join(fake.Mutations, "\n  "))
	}

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}
}

func TestUpgradeTakesTheLinksAndDropsTheOldVersion(t *testing.T) {
	fake := machine(version)
	install(t, fake)

	fake.Answer("cursor.com/install", installer(newer))

	if err := (Module{}).Upgrade(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if fake.Links[LegacyPath] != binaryPath(newer) {
		t.Fatalf("the link must move to %s, got %q", newer, fake.Links[LegacyPath])
	}

	if _, kept := fake.Files[binaryPath(version)]; kept {
		t.Fatal("the previous version must go")
	}

	if got := installedVersion(newContext(t, fake)); got != newer {
		t.Fatalf("installed version = %q", got)
	}
}

func TestUninstallKeepsTheAccountAndTheConversations(t *testing.T) {
	fake := machine(version)
	install(t, fake)
	fake.Files[configDir+"/cli-config.json"] = []byte("{}")

	if err := (Module{}).Uninstall(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if _, kept := fake.Links[BinPath]; kept {
		t.Fatal("the link must go")
	}

	if _, kept := fake.Files[binaryPath(version)]; kept {
		t.Fatal("the versions folder must go")
	}

	if _, kept := fake.Files[configDir+"/cli-config.json"]; !kept {
		t.Fatal("~/.cursor is the client's")
	}

	if strings.Contains(string(fake.Files[shell.EnvPath]), ID) {
		t.Fatal("the path block must go with the CLI")
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

func TestAnInstallerWithoutVersionIsRefused(t *testing.T) {
	fake := machine(version)
	fake.Answer("cursor.com/install", "#!/usr/bin/env bash\necho nothing\n")

	if err := (Module{}).Install(newContext(t, fake)); err == nil {
		t.Fatal("an installer that names no version must fail the step")
	}
}

// cursor-agent status answers JSON: whether anyone holds the tokens, and who when Cursor says.
func TestLoginReadsWhatCursorAgentStatusSays(t *testing.T) {
	cases := map[string]struct {
		answer string
		want   contract.Login
	}{
		"signed in": {
			answer: `{"status":"authenticated","isAuthenticated":true,"userInfo":{"email":"jordan@example.org"}}`,
			want:   contract.Login{State: contract.LoginSignedIn, Account: "jordan@example.org"},
		},
		"signed in without details": {
			answer: `{"status":"authenticated","isAuthenticated":true,"message":"Logged in (unable to fetch user details)"}`,
			want:   contract.Login{State: contract.LoginSignedIn},
		},
		"nobody": {
			answer: `{"status":"unauthenticated","isAuthenticated":false,"message":"Not logged in"}`,
			want:   contract.Login{State: contract.LoginSignedOut, Fix: "Open a terminal on this server and run NO_OPEN_BROWSER=1 cursor-agent login: the URL it prints opens the sign-in in your browser."},
		},
		"no answer": {
			answer: "",
			want:   contract.Login{State: contract.LoginUnknown, Fix: "Cursor CLI did not answer its own check: read this service again in a moment, or run cursor-agent status in a terminal on this server."},
		},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			fake := machine(version)
			fake.Answer("cursor-agent status --format json", tc.answer)

			got, asked := (Module{}).Login(newContext(t, fake))
			if !asked || got != tc.want {
				t.Fatalf("login = %+v (%v), want %+v", got, asked, tc.want)
			}
		})
	}
}

var _ modules.Module = Module{}
