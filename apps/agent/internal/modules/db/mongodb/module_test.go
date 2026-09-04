package mongodb

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/db/dumps"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sys/env"
)

const appPassword = "s3cret-de-test-app"

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{
		Manifest: manifest(),
		Secrets:  modtest.Secrets{"app_password": appPassword},
	})
}

func newFakeSys() *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Files[osReleasePath] = []byte("ID=ubuntu\nVERSION_CODENAME=noble\n")

	return fake
}

func installedSys(t *testing.T) *modtest.FakeSys {
	t.Helper()

	fake := newFakeSys()
	fake.Packages[pkg] = "8.0.4"
	fake.Units[unit] = modtest.UnitActive
	fake.Files[keyringPath] = []byte("-----BEGIN PGP PUBLIC KEY BLOCK-----\n")
	fake.Files[listPath] = repository("noble")
	fake.Files[confPath] = config
	fake.Files[markerPath] = []byte(appUser + "\n")
	fake.Files[env.Path] = []byte(appPasswordKey + "=" + appPassword + "\n")

	return fake
}

func install(t *testing.T, ctx *modules.Context) {
	t.Helper()

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}
}

func statuses(ctx *modules.Context) map[string]contract.StepStatus {
	steps := map[string]contract.StepStatus{}
	for _, event := range ctx.Events() {
		steps[event.Step] = event.Status
	}

	return steps
}

func TestInstallAndConfigureAreIdempotent(t *testing.T) {
	fake := installedSys(t)
	ctx := newContext(t, fake)

	install(t, ctx)

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must change nothing: %v", fake.Mutations)
	}

	if fake.Restarts[unit] != 0 {
		t.Fatalf("mongod restarted %d times on an installed machine", fake.Restarts[unit])
	}
}

func TestMongodbListensOnTheLoopbackWithAuthorizationOn(t *testing.T) {
	fake := newFakeSys()
	ctx := newContext(t, fake)

	install(t, ctx)

	written := string(fake.Files[confPath])
	for _, want := range []string{"bindIp: 127.0.0.1", "port: 27017", "authorization: enabled"} {
		if !strings.Contains(written, want) {
			t.Errorf("%s missing from %s:\n%s", want, confPath, written)
		}
	}

	if strings.Contains(written, "0.0.0.0") {
		t.Fatalf("no address but the loopback may appear:\n%s", written)
	}

	if fake.Units[unit] != modtest.UnitActive {
		t.Fatalf("the unit must be enabled: %v", fake.Units)
	}
}

func TestMongodb8ComesFromItsOwnRepository(t *testing.T) {
	fake := newFakeSys()
	ctx := newContext(t, fake)

	install(t, ctx)

	list := string(fake.Files[listPath])
	if !strings.Contains(list, "https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse") {
		t.Fatalf("%s = %q", listPath, list)
	}

	var fetched string
	for _, call := range fake.Commands() {
		if strings.HasPrefix(call, "curl") {
			fetched = call
		}
	}

	if !strings.Contains(fetched, keyringPath) || !strings.Contains(fetched, "https://www.mongodb.org/static/pgp/") {
		t.Fatalf("the repository key is fetched over https into the keyring: %q", fetched)
	}

	if _, installed := fake.Packages[pkg]; !installed {
		t.Fatalf("%s must be installed: %v", pkg, fake.Packages)
	}
}

func TestApplicationUserIsCreatedOnTheStandardInput(t *testing.T) {
	fake := newFakeSys()
	ctx := newContext(t, fake)

	install(t, ctx)

	var script string
	for _, call := range fake.Calls {
		if len(call.Stdin) > 0 {
			script = string(call.Stdin)
		}
	}

	for _, want := range []string{`admin.createUser({ user: "app"`, `const password = "` + appPassword + `";`, `role: "root"`, `admin.auth("app"`} {
		if !strings.Contains(script, want) {
			t.Errorf("the mongosh script lacks %q:\n%s", want, script)
		}
	}

	for _, call := range fake.Commands() {
		if strings.Contains(call, appPassword) {
			t.Fatalf("the password must not reach the argv of mongosh: %s", call)
		}
	}

	if _, marked := fake.Files[markerPath]; !marked {
		t.Fatal("a created user leaves a marker so the next install skips the step")
	}
}

func TestNoGeneratedPasswordReachesTheJournalOrTheEvents(t *testing.T) {
	fake := newFakeSys()
	ctx := newContext(t, fake)

	install(t, ctx)

	for _, line := range ctx.Output() {
		if strings.Contains(line, appPassword) {
			t.Fatalf("secret in the journal: %s", line)
		}
	}

	for _, event := range ctx.Events() {
		if strings.Contains(event.Step+event.Replay, appPassword) {
			t.Fatalf("secret in an event: %+v", event)
		}
	}

	if fake.EnvValue(appPasswordKey) != appPassword {
		t.Fatalf("the password belongs in %s: %s", env.Path, fake.Files[env.Path])
	}

	if strings.Contains(string(fake.Files[confPath]), appPassword) {
		t.Fatal("the configuration carries no password")
	}
}

func TestMongodumpArchivesAreImportedAndNamedInTheReport(t *testing.T) {
	fake := installedSys(t)
	fake.Dirs[dumps.Dir] = true
	fake.Replies["find"] = dumps.Dir + "/dump_shop_20260101.archive.gz\n"
	ctx := newContext(t, fake)

	install(t, ctx)

	if statuses(ctx)["import-shop"] != contract.StepOK {
		t.Fatalf("the report must name the imported database: %+v", ctx.Events())
	}

	var restore string
	for _, call := range fake.Calls {
		if call.Argv[0] == "mongorestore" {
			restore = strings.Join(call.Argv, " ")
		}
	}

	for _, want := range []string{"--archive=" + dumps.Dir + "/dump_shop_20260101.archive.gz", "--gzip", "--username=app"} {
		if !strings.Contains(restore, want) {
			t.Errorf("mongorestore lacks %q: %q", want, restore)
		}
	}

	// The mongo tools take their credentials on the command line and nowhere else; the journal is what must not carry them.
	for _, line := range ctx.Output() {
		if strings.Contains(line, appPassword) {
			t.Fatalf("the journal must mask the password of mongorestore: %s", line)
		}
	}
}

func TestUrlOpensTheApplicationUserThroughSshForward(t *testing.T) {
	ctx := newContext(t, installedSys(t))

	url, err := URL(ctx, "shop")
	if err != nil {
		t.Fatal(err)
	}

	if url != "mongodb://app@127.0.0.1:27017/shop?authSource=admin" {
		t.Fatalf("url = %q", url)
	}

	if strings.Contains(url, appPassword) {
		t.Fatal("an url carries no password")
	}

	empty, err := URL(ctx, "")
	if err != nil || empty != "mongodb://app@127.0.0.1:27017/admin?authSource=admin" {
		t.Fatalf("url without a name = %q, %v", empty, err)
	}

	if _, err := URL(newContext(t, newFakeSys()), "shop"); err == nil {
		t.Fatal("an engine that is not installed must say so")
	}
}

func TestShellPromptsForThePasswordAndDumpWritesAnArchive(t *testing.T) {
	fake := installedSys(t)
	ctx := newContext(t, fake)

	command, err := Shell(ctx, "shop")
	if err != nil {
		t.Fatal(err)
	}

	if command != "mongosh mongodb://app@127.0.0.1:27017/shop?authSource=admin" {
		t.Fatalf("shell = %q", command)
	}

	if strings.Contains(command, appPassword) {
		t.Fatal("the shell command never carries the password, mongosh asks for it")
	}

	fake.Answer("stat", "2048\n")
	path, size, err := Dump(ctx, "shop")
	if err != nil {
		t.Fatal(err)
	}

	if path != dumps.Dir+"/shop_20260904-1200.archive.gz" || size != 2048 {
		t.Fatalf("dump = %q, %d", path, size)
	}
}

func TestFailedStepReportsItsReplayCommand(t *testing.T) {
	fake := newFakeSys()
	fake.FailPackage(pkg, "E: Unable to locate package mongodb-org")
	ctx := newContext(t, fake)

	if err := (Module{}).Install(ctx); err == nil {
		t.Fatal("expected the install to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only=db.mongodb" {
		t.Fatalf("unexpected event: %+v", last)
	}
}

func TestUninstallLeavesTheDataAlone(t *testing.T) {
	fake := installedSys(t)
	ctx := newContext(t, fake)

	if err := (Module{}).Uninstall(ctx); err != nil {
		t.Fatal(err)
	}

	if _, kept := fake.Packages[pkg]; kept {
		t.Fatal("the package the module installed must go")
	}

	if _, kept := fake.Files[confPath]; kept {
		t.Fatal("the configuration the module wrote must go")
	}

	if fake.EnvValue(appPasswordKey) != "" {
		t.Fatalf("the key of the module must leave %s: %s", env.Path, fake.Files[env.Path])
	}

	for _, mutation := range fake.Mutations {
		if strings.Contains(mutation, "/var/lib/mongodb") {
			t.Fatalf("the client's data is never touched: %s", mutation)
		}
	}
}

func TestStatusNamesTheKeyNotTheSecret(t *testing.T) {
	ctx := newContext(t, installedSys(t))

	status, err := (Module{}).Status(ctx)
	if err != nil {
		t.Fatal(err)
	}

	if !status.Installed || status.State != contract.ServiceRunning || status.Port != Port || status.Unit != unit {
		t.Fatalf("status = %+v", status)
	}

	for _, value := range status.Credentials {
		if value != appPasswordKey {
			t.Fatalf("credentials must name the key of %s, got %q", env.Path, value)
		}
	}
}

var _ modules.Module = Module{}
