package claude

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/ai/agents"
	"pupitre.studio/agent/internal/modules/modtest"
)

const (
	latest = "2.1.263"
)

var download = "/home/dev/.claude/downloads/claude-" + latest + "-" + platform()

func releases(fake *modtest.FakeSys, version string) {
	fake.Answer("claude-code-releases/latest", version+"\n")
	fake.Answer("/"+version+"/manifest.json", `{"platforms":{"linux-x64":{"checksum":"`+checksum+`","size":1},"linux-arm64":{"checksum":"`+checksum+`","size":1}}}`)
}

// The manifest announces the digest of what the fake serves; a module that verifies its download finds the two agree.
var checksum = modtest.Digest(modtest.Downloaded)

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest()})
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

func TestFirstInstallLaysDownTheCliTheContextAndTheSkills(t *testing.T) {
	fake := modtest.NewFakeSys()
	releases(fake, latest)

	install(t, fake)

	if len(fake.Files[BinPath]) == 0 || fake.Owners[BinPath] != "dev:dev" {
		t.Fatalf("the CLI must be laid down for dev: %v", fake.Owners)
	}

	commands := strings.Join(fake.Commands(), "\n")
	for _, want := range []string{
		"(dev) curl -fsSL --proto =https --tlsv1.2 https://downloads.claude.ai/claude-code-releases/latest",
		"(dev) curl -fsSL --proto =https --tlsv1.2 https://downloads.claude.ai/claude-code-releases/2.1.263/manifest.json",
		"(dev) curl -fsSL --proto =https --tlsv1.2 -o " + download + " https://downloads.claude.ai/claude-code-releases/2.1.263/" + platform() + "/claude",
		"(dev) sha256sum " + download,
		"(dev) " + download + " install",
		"(dev) rm -f " + download,
	} {
		if !strings.Contains(commands, want) {
			t.Errorf("command %q not run:\n%s", want, commands)
		}
	}

	if _, kept := fake.Files[download]; kept {
		t.Error("the download must not stay behind")
	}

	if fake.Owners["/home/dev/.claude"] != "dev:dev" || fake.Owners["/home/dev/.claude/downloads"] != "dev:dev" {
		t.Errorf("the download folders must belong to dev: %v", fake.Owners)
	}

	context := string(fake.Files[configDir+"/CLAUDE.md"])
	if !strings.Contains(context, agents.ProjectsDir) || !strings.Contains(context, agents.SkillsDir) {
		t.Fatalf("the machine context must name the folders:\n%s", context)
	}

	for _, path := range []string{
		agents.SkillsDir + "/capture/SKILL.md",
		agents.SkillsDir + "/ship/SKILL.md",
		configDir + "/skills/capture/SKILL.md",
		configDir + "/agents/git-shipper.md",
	} {
		if len(fake.Files[path]) == 0 {
			t.Errorf("%s was not laid down", path)
		}
	}

	fake.Replies["claude"] = latest + " (Claude Code)\n"

	status, err := (Module{}).Status(newContext(t, fake))
	if err != nil {
		t.Fatal(err)
	}

	if !status.Installed || !status.Configured || status.Version != latest {
		t.Fatalf("status = %+v", status)
	}
}

func TestReplayMutatesNothing(t *testing.T) {
	fake := modtest.NewFakeSys()
	releases(fake, latest)
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

func TestABinaryWhoseChecksumDiffersIsRefusedAndRemoved(t *testing.T) {
	fake := modtest.NewFakeSys()
	releases(fake, latest)
	fake.Answer("/"+latest+"/manifest.json", `{"platforms":{"linux-x64":{"checksum":"`+strings.Repeat("f", 64)+`","size":1},"linux-arm64":{"checksum":"`+strings.Repeat("f", 64)+`","size":1}}}`)

	err := (Module{}).Install(newContext(t, fake))
	if err == nil || !strings.Contains(err.Error(), "checksum") {
		t.Fatalf("expected a checksum refusal, got %v", err)
	}

	if _, kept := fake.Files[download]; kept {
		t.Error("a refused download must not stay behind")
	}

	if _, laid := fake.Files[BinPath]; laid {
		t.Error("a refused binary must not be installed")
	}
}

func TestAnAnswerThatIsNotAVersionStopsBeforeAnyDownload(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("claude-code-releases/latest", "<html>blocked</html>\n")

	err := (Module{}).Install(newContext(t, fake))
	if err == nil || !strings.Contains(err.Error(), "instead of a version") {
		t.Fatalf("expected a refusal of the answer, got %v", err)
	}

	if strings.Contains(strings.Join(fake.Commands(), "\n"), "-o ") {
		t.Error("nothing must be downloaded on a bad version")
	}
}

func TestUpgradeInstallsOnlyWhenANewerVersionExists(t *testing.T) {
	fake := modtest.NewFakeSys()
	releases(fake, latest)
	install(t, fake)
	fake.Replies["claude"] = latest + " (Claude Code)\n"

	ctx := newContext(t, fake)
	if err := (Module{}).Upgrade(ctx); err != nil {
		t.Fatal(err)
	}

	if ctx.Events()[0].Step != "upgrade-cli" || ctx.Events()[0].Status != contract.StepSkip {
		t.Fatalf("up to date must skip, got %+v", ctx.Events()[0])
	}

	releases(fake, "2.2.0")

	ctx = newContext(t, fake)
	if err := (Module{}).Upgrade(ctx); err != nil {
		t.Fatal(err)
	}

	if ctx.Events()[0].Status != contract.StepOK {
		t.Fatalf("a newer version must install, got %+v", ctx.Events()[0])
	}

	if !strings.Contains(strings.Join(fake.Commands(), "\n"), "/2.2.0/"+platform()+"/claude") {
		t.Error("the newer binary was not downloaded")
	}
}

func TestTheVersionIsReadOffTheLinkWithoutStartingTheCli(t *testing.T) {
	fake := modtest.NewFakeSys()
	releases(fake, latest)
	install(t, fake)
	fake.Links[BinPath] = versionsDir + "/versions/" + latest
	fake.FailProgram("claude", "the CLI must not be started for its version")

	status, err := (Module{}).Status(newContext(t, fake))
	if err != nil || status.Version != latest {
		t.Fatalf("status = %+v, %v", status, err)
	}
}

func TestABinaryThatIsNotALinkIsAskedItsVersion(t *testing.T) {
	fake := modtest.NewFakeSys()
	releases(fake, latest)
	install(t, fake)
	fake.Links[BinPath] = versionsDir + "/latest"
	fake.Replies["claude"] = latest + " (Claude Code)\n"

	status, err := (Module{}).Status(newContext(t, fake))
	if err != nil || status.Version != latest {
		t.Fatalf("status = %+v, %v", status, err)
	}
}

func TestUninstallRemovesTheCliAndKeepsTheConversations(t *testing.T) {
	fake := modtest.NewFakeSys()
	releases(fake, latest)
	install(t, fake)
	fake.Files["/home/dev/.claude/history.jsonl"] = []byte("kept")
	fake.Files[versionsDir+"/versions/2.1.263"] = []byte("claude")

	if err := (Module{}).Uninstall(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if _, kept := fake.Files[BinPath]; kept {
		t.Error("the CLI must go")
	}

	if _, kept := fake.Files[versionsDir+"/versions/2.1.263"]; kept {
		t.Error("the kept versions must go")
	}

	if string(fake.Files["/home/dev/.claude/history.jsonl"]) != "kept" {
		t.Error("the conversations must stay")
	}
}

func TestFailedInstallCarriesItsReplayCommand(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailProgram("curl", "curl: (6) Could not resolve host: downloads.claude.ai")

	err := (Module{}).Install(newContext(t, fake))
	if err == nil {
		t.Fatal("expected the install to fail")
	}

	var step *modules.StepError
	if !asStepError(err, &step) || step.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected error: %#v", err)
	}
}

func asStepError(err error, target **modules.StepError) bool {
	step, ok := err.(*modules.StepError)
	if ok {
		*target = step
	}

	return ok
}

var _ modules.Module = Module{}

// claude auth status prints its JSON whether or not anyone is signed in, and exits 1 when nobody is.
func TestLoginReadsWhatClaudeAuthStatusSays(t *testing.T) {
	cases := map[string]struct {
		answer  string
		refused bool
		want    contract.Login
	}{
		"signed in": {
			answer: `{"loggedIn":true,"authMethod":"claude.ai","email":"jordan@example.org","orgName":"Flymate"}`,
			want:   contract.Login{State: contract.LoginSignedIn, Account: "jordan@example.org"},
		},
		"an organisation without an email": {
			answer: `{"loggedIn":true,"authMethod":"console","orgName":"Flymate"}`,
			want:   contract.Login{State: contract.LoginSignedIn, Account: "Flymate"},
		},
		"nobody": {
			answer:  `{"loggedIn":false,"authMethod":"none"}`,
			refused: true,
			want:    contract.Login{State: contract.LoginSignedOut, Fix: "Open a terminal on this server and run claude auth login: the URL it prints opens the sign-in in your browser."},
		},
		"no answer": {
			answer:  "",
			refused: true,
			want:    contract.Login{State: contract.LoginUnknown, Fix: "Claude Code did not answer its own check: read this service again in a moment, or run claude auth status in a terminal on this server."},
		},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			fake := modtest.NewFakeSys()
			if tc.refused {
				fake.Refuse("claude auth status", tc.answer)
			} else {
				fake.Answer("claude auth status", tc.answer)
			}

			got, asked := (Module{}).Login(newContext(t, fake))
			if !asked || got != tc.want {
				t.Fatalf("login = %+v (%v), want %+v", got, asked, tc.want)
			}

			last := fake.Calls[len(fake.Calls)-1]
			if last.User != "dev" || strings.Join(last.Argv, " ") != "claude auth status" {
				t.Fatalf("the check runs as dev on the CLI's own command: %+v", last)
			}
		})
	}
}
