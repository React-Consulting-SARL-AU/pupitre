package infisical

import (
	"encoding/base64"
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/download"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys"
)

const (
	clientID     = "5c2f1b0e-7a3d-4c1e-9f2a-0b8d6e4c2a1f"
	clientSecret = "s3cret-de-test"
	domain       = "https://eu.infisical.com"
	version      = "0.45.4"
	newer        = "0.46.0"
)

var accessTokenOf = "eyJhbGciOiJIUzI1NiJ9." + base64.RawURLEncoding.EncodeToString([]byte(`{"identityId":"id-1","identityName":"pupitre-vps"}`)) + ".c2lnbmF0dXJl"

func latestURL() string {
	return "https://github.com/Infisical/cli/releases/latest/download/checksums.txt"
}

func checksums(version string) string {
	return modtest.Digest(modtest.Downloaded) + "  " + release.Asset(version) + "\n"
}

func machine(published string) *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Users["dev"] = "/home/dev"
	fake.Answer("-w %{redirect_url} "+latestURL(), "https://github.com/Infisical/cli/releases/download/v"+published+"/checksums.txt")
	fake.Answer("infisical login", accessTokenOf)

	for _, v := range []string{version, newer} {
		fake.Answer("releases/download/v"+v+"/checksums.txt", checksums(v))
		fake.Archives[download.Dir+"/"+release.Asset(v)] = []string{Program}
	}

	return fake
}

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{
		Manifest: manifest(),
		Values:   modtest.Values{"domain": domain, "client_id": clientID},
		Secrets:  modtest.Secrets{"client_secret": clientSecret},
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

func lastCall(t *testing.T, fake *modtest.FakeSys, fragment string) sys.Command {
	t.Helper()

	for i := len(fake.Calls) - 1; i >= 0; i-- {
		if strings.Contains(strings.Join(fake.Calls[i].Argv, " "), fragment) {
			return fake.Calls[i]
		}
	}

	t.Fatalf("no call to %q among %v", fragment, fake.Commands())

	return sys.Command{}
}

func TestTheBinaryLandsCheckedAndTheIdentityReachesTheDevShell(t *testing.T) {
	fake := machine(version)

	ctx := run(t, fake)

	if len(fake.Files[BinPath]) == 0 || fake.Owners[BinPath] != "" {
		t.Fatalf("the binary must be root's under /usr/local/bin: %v %q", fake.Files[BinPath], fake.Owners[BinPath])
	}

	for key, value := range map[string]string{clientIDKey: clientID, clientSecretKey: clientSecret, domainKey: domain} {
		if fake.EnvValue(key) != value {
			t.Errorf("%s must be stored under root", key)
		}

		if !strings.Contains(string(fake.Files[shell.UserEnvPath]), "export "+key+"='"+value+"'") {
			t.Errorf("the dev shell must export %s:\n%s", key, fake.Files[shell.UserEnvPath])
		}
	}

	for _, line := range ctx.Output() {
		if strings.Contains(line, clientSecret) || strings.Contains(line, accessTokenOf) {
			t.Fatalf("a secret leaked into the journal: %s", line)
		}
	}

	status, err := (Module{}).Status(newContext(t, fake))
	if err != nil {
		t.Fatal(err)
	}

	if !status.Installed || !status.Configured || status.Version != version || status.Credentials["Machine identity client secret"] != clientSecretKey {
		t.Fatalf("status = %+v", status)
	}
}

func TestANewIdentityIsCheckedOnceAgainstItsInstance(t *testing.T) {
	fake := machine(version)
	run(t, fake)

	login := lastCall(t, fake, "infisical login")

	if login.User != shell.User || slices.ContainsFunc(login.Argv, func(arg string) bool { return strings.Contains(arg, clientSecret) }) {
		t.Fatalf("the login runs as dev with the secret out of argv: %+v", login)
	}

	for _, wanted := range []string{clientSecretKey + "=" + clientSecret, domainKey + "=" + domain, "INFISICAL_DISABLE_TELEMETRY=1"} {
		if !slices.Contains(login.Env, wanted) {
			t.Errorf("the login environment lacks %s", strings.SplitN(wanted, "=", 2)[0])
		}
	}

	before := logins(fake)
	run(t, fake)

	if logins(fake) != before {
		t.Fatal("an unchanged identity is not checked again")
	}
}

func logins(fake *modtest.FakeSys) int {
	count := 0

	for _, call := range fake.Calls {
		if strings.Contains(strings.Join(call.Argv, " "), "infisical login") {
			count++
		}
	}

	return count
}

func TestARefusedIdentityWarnsWithoutFailing(t *testing.T) {
	fake := machine(version)
	delete(fake.Answers, "infisical login")
	fake.Refuse("infisical login", "")

	ctx := run(t, fake)

	var warned bool

	for _, event := range ctx.Events() {
		warned = warned || (event.Step == "verify-identity" && event.Status == contract.StepOK && event.Message != "")
	}

	if !warned {
		t.Fatalf("a refused identity must warn on verify-identity: %+v", ctx.Events())
	}
}

func TestReplayMutatesNothing(t *testing.T) {
	fake := machine(version)
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

func TestAWrongChecksumIsRefused(t *testing.T) {
	fake := machine(version)
	fake.Answer("releases/download/v"+version+"/checksums.txt", strings.Repeat("0", 64)+"  "+release.Asset(version)+"\n")

	if err := (Module{}).Install(newContext(t, fake)); err == nil {
		t.Fatal("an archive whose digest is not the published one must be refused")
	}

	if _, kept := fake.Files[BinPath]; kept {
		t.Fatal("nothing must be installed")
	}
}

func TestUpgradeFollowsTheRelease(t *testing.T) {
	fake := machine(version)
	run(t, fake)

	fake.Answer("-w %{redirect_url} "+latestURL(), "https://github.com/Infisical/cli/releases/download/v"+newer+"/checksums.txt")

	if err := (Module{}).Upgrade(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if got := download.Recorded(newContext(t, fake), ID); got != newer {
		t.Fatalf("recorded version = %q, want %s", got, newer)
	}
}

func TestUninstallForgetsTheBinaryAndTheIdentity(t *testing.T) {
	fake := machine(version)
	run(t, fake)

	if err := (Module{}).Uninstall(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if _, kept := fake.Files[BinPath]; kept {
		t.Fatal("the binary must go")
	}

	for _, key := range []string{clientIDKey, clientSecretKey, domainKey} {
		if fake.EnvValue(key) != "" || strings.Contains(string(fake.Files[shell.UserEnvPath]), key) {
			t.Errorf("%s must go", key)
		}
	}
}

func TestLoginNamesTheIdentityTheAccessTokenCarries(t *testing.T) {
	fake := machine(version)

	got, asked := (Module{}).Login(newContext(t, fake))
	if !asked || got.State != contract.LoginSignedOut {
		t.Fatalf("without an identity the login is signed out: %+v", got)
	}

	run(t, fake)

	got, _ = (Module{}).Login(newContext(t, fake))
	if got != (contract.Login{State: contract.LoginSignedIn, Account: "pupitre-vps"}) {
		t.Fatalf("login = %+v", got)
	}

	fake.Answer("infisical login", "not-a-jwt")

	got, _ = (Module{}).Login(newContext(t, fake))
	if got.Account != clientID {
		t.Fatalf("an unnamed identity stands by its client ID: %+v", got)
	}

	delete(fake.Answers, "infisical login")
	fake.Refuse("infisical login", "")

	got, _ = (Module{}).Login(newContext(t, fake))
	if got.State != contract.LoginUnknown || got.Fix == "" {
		t.Fatalf("a refused identity is unknown with a fix: %+v", got)
	}
}

func TestProjectIDReadsBothFilesTheCliWrites(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want string
	}{
		{".infisical.json", `{"workspaceId":"63ee5410a45f7a1ed39ba118","defaultEnvironment":"dev"}`, "63ee5410a45f7a1ed39ba118"},
		{".infisical.json", `{"workspaceId":"a b; rm -rf /"}`, ""},
		{".infisical.json", `not json`, ""},
		{".infisical.yaml", "version: 1\nsecrets-management:\n  project-id: \"b1f3c0de-1234-4abc-9def-0123456789ab\"\n  environment: dev\n", "b1f3c0de-1234-4abc-9def-0123456789ab"},
		{".infisical.yaml", "version: 1\nsecrets-management:\n  project-id: 63ee5410 # from infisical init\n", "63ee5410"},
		{".infisical.yaml", "version: 1\ngeneral:\n  domain: https://eu.infisical.com\n", ""},
	}

	for _, c := range cases {
		if got := ProjectID(c.name, []byte(c.raw)); got != c.want {
			t.Errorf("ProjectID(%s, %q) = %q, want %q", c.name, c.raw, got, c.want)
		}
	}
}

func TestExportHandsTheProjectAndTheAccessTokenThroughTheEnvironment(t *testing.T) {
	fake := machine(version)
	run(t, fake)
	fake.Answer("secrets export", "DATABASE_URL='postgres://dev@127.0.0.1/flyleaf'\n")

	dir := "/home/dev/projects/flyleaf"
	ctx := newContext(t, fake)

	if !Ready(ctx) {
		t.Fatal("a configured machine is ready to export")
	}

	content, err := Export(ctx, dir, "63ee5410")
	if err != nil {
		t.Fatal(err)
	}

	if string(content) != "DATABASE_URL='postgres://dev@127.0.0.1/flyleaf'\n" {
		t.Fatalf("content = %q", content)
	}

	call := lastCall(t, fake, "secrets export")

	if call.User != shell.User || call.Dir != dir {
		t.Fatalf("the export runs as dev in the project's folder, where the CLI reads its environment: %+v", call)
	}

	for _, wanted := range []string{"INFISICAL_TOKEN=" + accessTokenOf, "INFISICAL_PROJECT_ID=63ee5410", domainKey + "=" + domain} {
		if !slices.Contains(call.Env, wanted) {
			t.Errorf("the export environment lacks %s", strings.SplitN(wanted, "=", 2)[0])
		}
	}

	if strings.Contains(strings.Join(call.Argv, " "), accessTokenOf) {
		t.Fatal("the access token never travels in argv")
	}

	for _, line := range ctx.Output() {
		if strings.Contains(line, "postgres://") || strings.Contains(line, accessTokenOf) {
			t.Fatalf("a secret leaked into the journal: %s", line)
		}
	}
}

func TestNotReadyWithoutTheBinaryOrTheIdentity(t *testing.T) {
	fake := machine(version)

	if Ready(newContext(t, fake)) {
		t.Fatal("an empty machine is not ready")
	}

	if err := (Module{}).Install(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if Ready(newContext(t, fake)) {
		t.Fatal("a binary without an identity is not ready")
	}
}

var _ modules.Module = Module{}
