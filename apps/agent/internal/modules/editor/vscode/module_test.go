package vscode

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/download"
	"pupitre.studio/agent/internal/modules/modtest"
)

const (
	commit  = "a44adf7f53e00964ab890f9f8758a334f1fc15bc"
	product = "1.136.1"
)

// The update service names the archive and its SHA-256; the fake serves a body whose digest is exactly that.
var update = `{"url":"https://vscode.download.prss.microsoft.com/stable/code.tar.gz","name":"1.136.1","version":"` + commit + `","productVersion":"` + product + `","sha256hash":"` + modtest.Digest(modtest.Downloaded) + `"}`

var serverDir = binRoot + "/" + commit

func newContext(t *testing.T, fake *modtest.FakeSys, values modtest.Values) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Values: values})
}

func machine() *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Users["dev"] = "/home/dev"
	fake.Answer("update.code.visualstudio.com/api/update", update)
	fake.Archives[download.Dir+"/"+serverArchive] = []string{"bin/code-server", "product.json"}
	fake.Archives[download.Dir+"/"+cliArchive] = []string{"code"}

	return fake
}

func install(t *testing.T, fake *modtest.FakeSys, values modtest.Values) *modules.Context {
	t.Helper()

	ctx := newContext(t, fake, values)

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

func TestFirstInstallLaysTheCLIAndTheServerOfTheCurrentCommit(t *testing.T) {
	fake := machine()

	install(t, fake, modtest.Values{"extensions": []any{"esbenp.prettier-vscode"}, "tunnel": false})

	if len(fake.Files[cliPath]) == 0 {
		t.Fatalf("the code CLI must land in %s, files: %v", cliPath, fake.Files)
	}

	if len(fake.Files[serverDir+"/bin/code-server"]) == 0 {
		t.Fatalf("the remote server must be extracted into %s", serverDir)
	}

	if fake.Links[cliServers+"/Stable-"+commit+"/server"] != serverDir {
		t.Fatalf("Remote SSH also looks under cli/servers, links: %v", fake.Links)
	}

	if !strings.Contains(string(fake.Files[pointerPath]), product) {
		t.Fatalf("the installed release must be recorded: %q", fake.Files[pointerPath])
	}

	if fake.Extensions["esbenp.prettier-vscode"] == "" {
		t.Fatalf("the listed extensions must be installed: %v", fake.Extensions)
	}
}

func TestAnEmptyExtensionListInstallsNothing(t *testing.T) {
	fake := machine()

	ctx := install(t, fake, modtest.Values{"extensions": []any{}, "tunnel": false})

	if len(fake.Extensions) != 0 {
		t.Fatalf("no extension was asked for, %v were installed", fake.Extensions)
	}

	for _, line := range fake.Commands() {
		if strings.Contains(line, "--install-extension") || strings.Contains(line, "--list-extensions") {
			t.Fatalf("without extensions the server CLI is never called: %s", line)
		}
	}

	if !skipped(ctx, "install-extensions") {
		t.Fatal("the extension step must skip rather than run empty")
	}
}

func TestTunnelOffLeavesNoService(t *testing.T) {
	fake := machine()

	install(t, fake, modtest.Values{"tunnel": false})

	if len(fake.Files[unitPath]) != 0 {
		t.Fatalf("no tunnel means no unit file: %q", fake.Files[unitPath])
	}

	if fake.Units[Unit] != modtest.UnitAbsent {
		t.Fatalf("no tunnel means no unit at all, got %q", fake.Units[Unit])
	}

	for _, line := range fake.Commands() {
		if strings.Contains(line, "systemctl enable") {
			t.Fatalf("nothing to enable without a tunnel: %s", line)
		}
	}
}

func TestTunnelOnWritesTheServiceAndAsksForTheLogin(t *testing.T) {
	fake := machine()

	ctx := install(t, fake, modtest.Values{"tunnel": true})

	unit := string(fake.Files[unitPath])
	if !strings.Contains(unit, "User=dev") || !strings.Contains(unit, cliPath+" tunnel") {
		t.Fatalf("the tunnel runs as dev through the CLI:\n%s", unit)
	}

	if fake.Units[Unit] != modtest.UnitActive {
		t.Fatalf("the unit must be active, got %q", fake.Units[Unit])
	}

	joined := strings.Join(ctx.Output(), "\n")
	if !strings.Contains(joined, "tunnel user login") {
		t.Fatalf("the client has to authenticate the tunnel once:\n%s", joined)
	}
}

func TestReplayMutatesNothing(t *testing.T) {
	fake := machine()
	install(t, fake, modtest.Values{"extensions": []any{"esbenp.prettier-vscode"}, "tunnel": true})

	fake.Mutations = nil
	ctx := install(t, fake, modtest.Values{"extensions": []any{"esbenp.prettier-vscode"}, "tunnel": true})

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine:\n  %s", strings.Join(fake.Mutations, "\n  "))
	}

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}
}

// A build published since the install is not what a changed setting costs: the replay keeps the server it has, upgrade is what moves it.
func TestAReplayKeepsTheInstalledBuildAndUpgradeMovesIt(t *testing.T) {
	fake := machine()
	install(t, fake, modtest.Values{"tunnel": false})

	newer := strings.Replace(update, commit, "b55bef8064f11a75bc9a1a0a9869a445a2fd26cd", 1)
	newer = strings.ReplaceAll(newer, product, "1.137.0")
	fake.Answer("update.code.visualstudio.com/api/update", newer)
	fake.Mutations = nil

	ctx := install(t, fake, modtest.Values{"tunnel": true})

	if len(fake.Files[binRoot+"/b55bef8064f11a75bc9a1a0a9869a445a2fd26cd/bin/code-server"]) != 0 || !skipped(ctx, "install-server") {
		t.Fatalf("a replay must not fetch a newer server: %v", fake.Mutations)
	}

	if !strings.Contains(string(fake.Files[pointerPath]), product) {
		t.Fatalf("the record must still name the installed build: %q", fake.Files[pointerPath])
	}

	if err := (Module{}).Upgrade(newContext(t, fake, modtest.Values{"tunnel": true})); err != nil {
		t.Fatal(err)
	}

	if len(fake.Files[binRoot+"/b55bef8064f11a75bc9a1a0a9869a445a2fd26cd/bin/code-server"]) == 0 || !strings.Contains(string(fake.Files[pointerPath]), "1.137.0") {
		t.Fatalf("upgrade must lay the newer server and record it: %q", fake.Files[pointerPath])
	}
}

func TestUninstallKeepsWhatBelongsToTheClient(t *testing.T) {
	fake := machine()
	install(t, fake, modtest.Values{"extensions": []any{"esbenp.prettier-vscode"}, "tunnel": true})
	fake.Files[extensionsDir+"/esbenp.prettier-vscode/package.json"] = []byte("{}")

	if err := (Module{}).Uninstall(newContext(t, fake, modtest.Values{"tunnel": true})); err != nil {
		t.Fatal(err)
	}

	if len(fake.Files[cliPath]) != 0 || len(fake.Files[pointerPath]) != 0 || len(fake.Files[unitPath]) != 0 {
		t.Fatal("the CLI, the release record and the unit go with the module")
	}

	if len(fake.Files[extensionsDir+"/esbenp.prettier-vscode/package.json"]) == 0 {
		t.Fatal("the extensions folder belongs to the client")
	}
}

func TestAnUnreachableUpdateAPICarriesItsReplayCommand(t *testing.T) {
	fake := machine()
	fake.Answers = map[string]string{}
	fake.FailProgram("curl", "curl: (6) Could not resolve host: update.code.visualstudio.com")

	err := (Module{}).Install(newContext(t, fake, nil))
	if err == nil {
		t.Fatal("expected the install to fail")
	}

	step, ok := err.(*modules.StepError)
	if !ok || step.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected error: %#v", err)
	}
}

func skipped(ctx *modules.Context, step string) bool {
	for _, event := range ctx.Events() {
		if event.Step == step {
			return event.Status == contract.StepSkip
		}
	}

	return false
}

var _ modules.Module = Module{}

// Only the tunnel signs in: a machine without the unit has nothing to say, and one with it says what code tunnel user show says.
func TestLoginSpeaksForTheTunnelAlone(t *testing.T) {
	bare := machine()
	if _, asked := (Module{}).Login(newContext(t, bare, modtest.Values{})); asked {
		t.Fatal("no tunnel, no login to report")
	}

	cases := map[string]struct {
		answer  string
		refused bool
		want    contract.Login
	}{
		"signed in": {
			answer: "logged in with provider github\n",
			want:   contract.Login{State: contract.LoginSignedIn, Account: "github"},
		},
		"nobody": {
			answer:  "not logged in\n",
			refused: true,
			want:    contract.Login{State: contract.LoginSignedOut, Fix: "Open a terminal on this server and run code tunnel user login: the code it prints goes on the page it names."},
		},
		"no answer": {
			answer:  "",
			refused: true,
			want:    contract.Login{State: contract.LoginUnknown, Fix: "VS Code did not answer its own check: read this service again in a moment, or run code tunnel user show in a terminal on this server."},
		},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			fake := machine()
			fake.Files[unitPath] = []byte("[Unit]\n")
			if tc.refused {
				fake.Refuse("tunnel user show", tc.answer)
			} else {
				fake.Answer("tunnel user show", tc.answer)
			}

			got, asked := (Module{}).Login(newContext(t, fake, modtest.Values{}))
			if !asked || got != tc.want {
				t.Fatalf("login = %+v (%v), want %+v", got, asked, tc.want)
			}
		})
	}
}
