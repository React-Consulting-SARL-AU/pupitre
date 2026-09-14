package tailscale

import (
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
)

const authKey = "tskey-auth-s3cret-de-test"

func newContext(t *testing.T, fake *modtest.FakeSys, values modtest.Values) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Values: values, Secrets: modtest.Secrets{"auth_key": authKey}})
}

func machine() *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Files["/etc/os-release"] = []byte("VERSION_CODENAME=noble\n")

	return fake
}

func TestFirstInstallAddsTheRepositoryJoinsAndOpensTheFirewall(t *testing.T) {
	fake := machine()
	ctx := newContext(t, fake, modtest.Values{"hostname": "atelier", "ssh": true})

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	if len(fake.Files[keyringPath]) == 0 || !strings.Contains(string(fake.Files[sourcePath]), "pkgs.tailscale.com/stable/ubuntu noble main") {
		t.Fatalf("the vendor repository must be added, key first: %q", fake.Files[sourcePath])
	}

	if fake.Packages[pkg] == "" {
		t.Fatal("the package must be installed")
	}

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	joinedWith := ""
	for _, line := range fake.Commands() {
		if strings.Contains(line, "tailscale up") {
			joinedWith = line
		}
	}

	if !strings.Contains(joinedWith, "--auth-key=") || !strings.Contains(joinedWith, "--hostname=atelier") || !strings.Contains(joinedWith, "--ssh") {
		t.Fatalf("tailscale up must carry the key, the name and the ssh switch: %s", joinedWith)
	}

	for _, line := range ctx.Output() {
		if strings.Contains(line, authKey) {
			t.Fatalf("the auth key leaked into the journal: %s", line)
		}
	}

	if !slices.Contains(fake.Firewall.Rules, "Anywhere on "+device) {
		t.Fatalf("the tailnet interface must be let in: %v", fake.Firewall.Rules)
	}

	if fake.Units[Unit] != modtest.UnitActive {
		t.Fatal("tailscaled must be enabled")
	}

	status, err := (Module{}).Status(ctx)
	if err != nil {
		t.Fatal(err)
	}

	if !status.Installed || !status.Configured || status.Unit != Unit {
		t.Fatalf("status = %+v", status)
	}
}

// A name or an SSH switch changed after the join reaches the node through set: up would ask for a key the client already spent.
func TestChangedSettingsAreSetOnTheJoinedNode(t *testing.T) {
	fake := machine()
	fake.Packages[pkg] = "1.90.0"
	fake.Files[keyringPath] = []byte("key")
	fake.Files[sourcePath] = repository("noble")
	fake.Units[Unit] = modtest.UnitActive
	fake.Firewall.Rules = []string{"Anywhere on " + device}
	fake.Tailnet = true
	fake.Prefs = modtest.TailscalePrefs{Hostname: "old-name"}

	fake.Mutations = nil
	ctx := newContext(t, fake, modtest.Values{"hostname": "new-name", "ssh": true})

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	if strings.Join(fake.Mutations, "\n") != "tailscale set --hostname=new-name --ssh=true" {
		t.Fatalf("only set must run, once: %v", fake.Mutations)
	}

	if fake.Prefs != (modtest.TailscalePrefs{Hostname: "new-name", SSH: true}) {
		t.Fatalf("the node must carry the new settings: %+v", fake.Prefs)
	}
}

func TestReplayMutatesNothingOnceJoined(t *testing.T) {
	fake := machine()
	fake.Packages[pkg] = "1.90.0"
	fake.Files[keyringPath] = []byte("key")
	fake.Files[sourcePath] = repository("noble")
	fake.Units[Unit] = modtest.UnitActive
	fake.Firewall.Rules = []string{"Anywhere on " + device}
	fake.Tailnet = true

	fake.Mutations = nil
	ctx := newContext(t, fake, modtest.Values{})

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine:\n  %s", strings.Join(fake.Mutations, "\n  "))
	}

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}

	for _, line := range fake.Commands() {
		if strings.Contains(line, "tailscale up") {
			t.Fatal("a node already on the tailnet is not joined again")
		}
	}
}

func TestAKeyTheTailnetRefusesFailsTheJoin(t *testing.T) {
	fake := machine()
	fake.Packages[pkg] = "1.90.0"
	fake.Refuse("tailscale up", "backend error: invalid key: unable to validate API key\n")

	err := (Module{}).Configure(newContext(t, fake, modtest.Values{}))
	if err == nil {
		t.Fatal("a refused key must fail the step")
	}

	step, ok := err.(*modules.StepError)
	if !ok || step.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected error: %#v", err)
	}
}

func TestUninstallLeavesTheTailnetAndTakesEverythingBack(t *testing.T) {
	fake := machine()
	fake.Packages[pkg] = "1.90.0"
	fake.Files[keyringPath] = []byte("key")
	fake.Files[sourcePath] = repository("noble")
	fake.Units[Unit] = modtest.UnitActive
	fake.Firewall.Rules = []string{"Anywhere on " + device}
	fake.Tailnet = true

	if err := (Module{}).Uninstall(newContext(t, fake, modtest.Values{})); err != nil {
		t.Fatal(err)
	}

	left := false
	for _, line := range fake.Commands() {
		left = left || strings.Contains(line, "tailscale logout")
	}

	if !left || fake.Tailnet || fake.Packages[pkg] != "" || slices.Contains(fake.Firewall.Rules, "Anywhere on "+device) || fake.Units[Unit] == modtest.UnitActive {
		t.Fatalf("the node must leave, the package, the rule and the unit must go: %v %v %v", fake.Packages, fake.Firewall.Rules, fake.Units)
	}

	for _, path := range []string{sourcePath, keyringPath} {
		if _, kept := fake.Files[path]; kept {
			t.Errorf("%s must go", path)
		}
	}
}

// tailscale status says whether the node is on a tailnet and under whose login; it never reaches the coordination server for that.
func TestLoginReadsWhatTailscaleStatusSays(t *testing.T) {
	cases := map[string]struct {
		answer string
		want   contract.Login
	}{
		"on the tailnet": {answer: modtest.Joined, want: contract.Login{State: contract.LoginSignedIn, Account: "jordan@example.org"}},
		"no user in the status": {
			answer: `{"BackendState":"Running","Self":{"DNSName":"pupitre-srv.tail1234.ts.net."}}`,
			want:   contract.Login{State: contract.LoginSignedIn, Account: "pupitre-srv.tail1234.ts.net"},
		},
		"needs login": {
			answer: `{"BackendState":"NeedsLogin"}`,
			want:   contract.Login{State: contract.LoginSignedOut, Fix: "The machine is on no tailnet: apply this service's configuration with a valid auth key, or run sudo tailscale up in a terminal on this server and open the URL it prints."},
		},
		"no answer": {
			answer: "",
			want:   contract.Login{State: contract.LoginUnknown, Fix: "Tailscale did not answer its own check: read this service again in a moment, or run tailscale status in a terminal on this server."},
		},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			fake := machine()
			fake.Answer("tailscale status --json", tc.answer)

			got, asked := (Module{}).Login(newContext(t, fake, modtest.Values{}))
			if !asked || got != tc.want {
				t.Fatalf("login = %+v (%v), want %+v", got, asked, tc.want)
			}
		})
	}
}

var _ modules.Module = Module{}
var _ modules.Account = Module{}
