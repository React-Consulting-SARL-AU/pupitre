package opencode

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
	version = "1.18.30"
	newer   = "1.19.0"
)

// The release document GitHub answers, with the digest of what the fake's curl serves beside every Linux asset.
func releaseDocument(version, digest string) string {
	assets := ""
	for _, name := range []string{"opencode-linux-x64.tar.gz", "opencode-linux-x64-baseline.tar.gz", "opencode-linux-arm64.tar.gz", "opencode-darwin-arm64.zip"} {
		assets += `{"name":"` + name + `","digest":"sha256:` + digest + `","browser_download_url":"https://github.com/anomalyco/opencode/releases/download/v` + version + `/` + name + `"},`
	}

	return `{"tag_name":"v` + version + `","assets":[` + strings.TrimSuffix(assets, ",") + `]}`
}

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest()})
}

func machine(published string) *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Users["dev"] = "/home/dev"
	fake.Files["/proc/cpuinfo"] = []byte("flags : fpu avx avx2 sse4_2\n")
	fake.Answer("api.github.com/repos/anomalyco/opencode/releases/latest", releaseDocument(published, modtest.Digest(modtest.Downloaded)))

	for _, v := range []string{version, newer} {
		fake.Archives[download.Dir+"/"+Program+"-"+v+".tar.gz"] = []string{Program}
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

func TestFirstInstallLaysDownTheBinaryTheContextAndTheSkills(t *testing.T) {
	fake := machine(version)

	install(t, fake)

	if len(fake.Files[BinPath]) == 0 {
		t.Fatalf("the binary must land on ~/.local/bin: %v", fake.Files)
	}

	if fake.Owners[BinPath] != "dev:dev" {
		t.Errorf("the binary belongs to dev, got %q", fake.Owners[BinPath])
	}

	if got := strings.TrimSpace(string(fake.Files[pointerPath])); got != version {
		t.Errorf("the pointer must record %s, got %q", version, got)
	}

	context := string(fake.Files[configDir+"/AGENTS.md"])
	if !strings.Contains(context, agents.ProjectsDir) || !strings.Contains(context, agents.SkillsDir) {
		t.Fatalf("the machine context must name the folders:\n%s", context)
	}

	for _, path := range []string{
		agents.SkillsDir + "/capture/SKILL.md",
		configDir + "/skills/ship/SKILL.md",
	} {
		if len(fake.Files[path]) == 0 {
			t.Errorf("%s was not laid down", path)
		}
	}

	for path := range fake.Files {
		if strings.HasPrefix(path, download.Dir) {
			t.Errorf("%s was left in the staging folder", path)
		}
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

func TestAWrongDigestIsRefused(t *testing.T) {
	fake := machine(version)
	fake.Answer("api.github.com/repos/anomalyco/opencode/releases/latest", releaseDocument(version, strings.Repeat("0", 64)))

	err := (Module{}).Install(newContext(t, fake))
	if err == nil {
		t.Fatal("a download whose digest is not the published one must be refused")
	}

	if _, kept := fake.Files[BinPath]; kept {
		t.Fatal("nothing must be installed")
	}
}

func TestAMachineWithoutAvx2GetsTheBaselineBuild(t *testing.T) {
	fake := machine(version)
	fake.Files["/proc/cpuinfo"] = []byte("flags : fpu sse4_2\n")

	install(t, fake)

	for _, line := range fake.Commands() {
		if strings.Contains(line, "opencode-linux-x64.tar.gz") {
			t.Fatalf("the AVX2 build was fetched: %s", line)
		}
	}
}

func TestUpgradeReplacesTheBinaryAndThePointer(t *testing.T) {
	fake := machine(version)
	install(t, fake)

	fake.Answer("api.github.com/repos/anomalyco/opencode/releases/latest", releaseDocument(newer, modtest.Digest(modtest.Downloaded)))

	if err := (Module{}).Upgrade(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if got := installedVersion(newContext(t, fake)); got != newer {
		t.Fatalf("installed version = %q, want %s", got, newer)
	}
}

func TestUninstallKeepsTheCredentialsAndTheSessions(t *testing.T) {
	fake := machine(version)
	install(t, fake)
	fake.Files[dataDir+"/auth.json"] = []byte("{}")
	fake.Files[configDir+"/opencode.json"] = []byte("{}")

	if err := (Module{}).Uninstall(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	for _, gone := range []string{BinPath, pointerPath, configDir + "/AGENTS.md"} {
		if _, kept := fake.Files[gone]; kept {
			t.Errorf("%s must go", gone)
		}
	}

	for _, kept := range []string{dataDir + "/auth.json", configDir + "/opencode.json"} {
		if _, there := fake.Files[kept]; !there {
			t.Errorf("%s is the client's", kept)
		}
	}

	if strings.Contains(string(fake.Files[shell.EnvPath]), ID) {
		t.Fatal("the path block must go with the binary")
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

// opencode auth list draws a box around one line per credential and a tally; the providers are the account, and none is signed out.
func TestLoginReadsWhatOpencodeAuthListSays(t *testing.T) {
	cases := map[string]struct {
		answer string
		want   contract.Login
	}{
		"two providers": {
			answer: "\n┌  Credentials \x1b[90m~/.local/share/opencode/auth.json\x1b[0m\n│\n●  Anthropic \x1b[90moauth\x1b[0m\n●  OpenAI \x1b[90mapi\x1b[0m\n│\n└  2 credentials\n",
			want:   contract.Login{State: contract.LoginSignedIn, Account: "Anthropic, OpenAI"},
		},
		"one provider and an environment section": {
			answer: "┌  Credentials ~/.local/share/opencode/auth.json\n●  GitHub Copilot oauth\n└  1 credential\n\n┌  Environment\n●  Anthropic ANTHROPIC_API_KEY\n└  1 environment variable\n",
			want:   contract.Login{State: contract.LoginSignedIn, Account: "GitHub Copilot"},
		},
		"nobody": {
			answer: "┌  Credentials ~/.local/share/opencode/auth.json\n└  0 credentials\n",
			want:   contract.Login{State: contract.LoginSignedOut, Fix: "Open a terminal on this server and run opencode auth login: pick the provider, then the subscription or the key that goes with it."},
		},
		"no answer": {
			answer: "",
			want:   contract.Login{State: contract.LoginUnknown, Fix: "OpenCode did not answer its own check: read this service again in a moment, or run opencode auth list in a terminal on this server."},
		},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			fake := machine(version)
			fake.Answer("opencode auth list", tc.answer)

			got, asked := (Module{}).Login(newContext(t, fake))
			if !asked || got != tc.want {
				t.Fatalf("login = %+v (%v), want %+v", got, asked, tc.want)
			}
		})
	}
}

var _ modules.Module = Module{}
