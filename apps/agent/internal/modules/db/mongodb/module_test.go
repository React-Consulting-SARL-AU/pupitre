package mongodb

import (
	"os"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/db/dumps"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sys/env"
)

const (
	appPassword = "s3cret-de-test-app"

	defaultKeyring = keyringDir + "/mongodb-" + DefaultVersion + ".asc"
	defaultList    = "/etc/apt/sources.list.d/mongodb-org-" + DefaultVersion + ".list"
)

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{
		Manifest: manifest(),
		Secrets:  modtest.Secrets{"app_password": appPassword},
	})
}

// A quarter of the 3.83 GB the fake machine reports.
const memorySizedCache = "0.96"

func newFakeSys() *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Files["/etc/os-release"] = []byte("ID=ubuntu\nVERSION_CODENAME=noble\n")
	fake.Files["/proc/meminfo"] = []byte("MemTotal:       4015000 kB\n")
	fake.Answers["mongosh"] = userReady + "\n"

	return fake
}

// The fake never opens a port on its own: the wait for mongod is switched off, and the one test that exercises it turns it back on.
func TestMain(m *testing.M) {
	startWait = 0

	os.Exit(m.Run())
}

// mongosh reads its script on a REPL: an uncaught error prints and exits 0, so only the script's own last word says the user is there.
func TestAUserScriptThatDoesNotReportReadyIsARefusal(t *testing.T) {
	fake := newFakeSys()
	fake.Answers["mongosh"] = "test> Uncaught MongoServerError[Unauthorized]: not authorized on admin to execute command\n"
	ctx := newContext(t, fake)

	err := (Module{}).Configure(ctx)

	if err == nil || statuses(ctx)["create-app-user"] != contract.StepFail {
		t.Fatalf("the step must fail on a script that did not finish: err=%v steps=%v", err, statuses(ctx))
	}

	if _, written := fake.Files[markerPath]; written {
		t.Fatal("no marker may claim a user that was never created")
	}
}

// mongod takes its time to listen after a start: a shell refused on the door is asked again, and the user is created once it opens.
func TestTheUserIsCreatedOnceTheEngineListens(t *testing.T) {
	fake := newFakeSys()
	startWait, startPoll = time.Second, 10*time.Millisecond
	defer func() { startWait = 0 }()
	fake.Once["mongosh"] = "MongoNetworkError: connect ECONNREFUSED 127.0.0.1:27017"

	ctx := newContext(t, fake)
	install(t, ctx)

	shells := 0
	for _, cmd := range fake.Calls {
		if cmd.Argv[0] == "mongosh" {
			shells++
		}
	}

	if statuses(ctx)["create-app-user"] != contract.StepOK || shells != 2 {
		t.Fatalf("the shell must be asked again once the door opens: %v, %d shell(s)", statuses(ctx), shells)
	}
}

func installedSys(t *testing.T) *modtest.FakeSys {
	t.Helper()

	fake := newFakeSys()
	fake.Packages[pkg] = "8.0.4"
	fake.Units[unit] = modtest.UnitActive
	fake.Files[defaultKeyring] = []byte("-----BEGIN PGP PUBLIC KEY BLOCK-----\n")
	fake.Files[defaultList] = repository(DefaultVersion, "noble")
	fake.Files[confPath] = renderConfig(DefaultPort, memorySizedCache)
	fake.Files[markerPath] = []byte(defaultAppUser + "\n")
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

	list := string(fake.Files[defaultList])
	if !strings.Contains(list, "https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse") {
		t.Fatalf("%s = %q", defaultList, list)
	}

	var fetched string
	for _, call := range fake.Commands() {
		if strings.HasPrefix(call, "curl") {
			fetched = call
		}
	}

	if !strings.Contains(fetched, defaultKeyring) || !strings.Contains(fetched, "https://www.mongodb.org/static/pgp/") {
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
	fake.Replies["find"] = dumps.Dir + "/dump_shop_20260101.archive.gz\x00"
	ctx := newContext(t, fake)

	install(t, ctx)

	if statuses(ctx)["import-shop"] != contract.StepOK {
		t.Fatalf("the report must name the imported database: %+v", ctx.Events())
	}

	var restore, fed string
	for _, call := range fake.Calls {
		if call.Argv[0] == "mongorestore" {
			restore = strings.Join(call.Argv, " ")
			fed = call.StdinPath
		}
	}

	if fed != dumps.Dir+"/dump_shop_20260101.archive.gz" {
		t.Fatalf("the archive reaches mongorestore on a standard input root opened without following a link: %q", fed)
	}

	for _, want := range []string{"--archive", "--gzip", "--username=app", "--config=" + toolsConfigPath} {
		if !strings.Contains(restore, want) {
			t.Errorf("mongorestore lacks %q: %q", want, restore)
		}
	}

	if strings.Contains(restore, appPassword) || strings.Contains(restore, "--password") {
		t.Fatalf("the password must reach mongorestore through its config file, never through the argv ps shows: %q", restore)
	}

	if _, present := fake.Files[toolsConfigPath]; present {
		t.Fatal("the config file carrying the password must not outlive the command")
	}

	mutations := strings.Join(fake.Mutations, "\n")
	if !strings.Contains(mutations, "write "+toolsConfigPath+"\nremove "+toolsConfigPath) {
		t.Fatalf("the config file is written for the command and removed right after:\n%s", mutations)
	}

	for _, line := range ctx.Output() {
		if strings.Contains(line, appPassword) {
			t.Fatalf("the journal must not carry the password: %s", line)
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

	path, size, err := Dump(ctx, "shop")
	if err != nil {
		t.Fatal(err)
	}

	if path != dumps.Dir+"/shop_20260904-1200.archive.gz" || size != int64(len("dump")) || string(fake.Files[path]) != "dump" {
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

	if !status.Installed || status.State != contract.ServiceRunning || status.Port != DefaultPort || status.Unit != unit {
		t.Fatalf("status = %+v", status)
	}

	for _, value := range status.Credentials {
		if value != appPasswordKey {
			t.Fatalf("credentials must name the key of %s, got %q", env.Path, value)
		}
	}
}

var _ modules.Module = Module{}

func newContextWith(t *testing.T, fake *modtest.FakeSys, values modtest.Values) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{
		Manifest: manifest(),
		Values:   values,
		Secrets:  modtest.Secrets{"app_password": appPassword},
	})
}

// Left at zero the cache follows the machine; a figure given follows the client, whose database may be the whole point of the server.
func TestTheCacheFollowsTheMachineUntilTheClientSizesIt(t *testing.T) {
	fake := newFakeSys()
	install(t, newContext(t, fake))

	if !strings.Contains(string(fake.Files[confPath]), "cacheSizeGB: "+memorySizedCache) {
		t.Fatalf("an unsized cache follows the memory:\n%s", fake.Files[confPath])
	}

	chosen := newFakeSys()
	install(t, newContextWith(t, chosen, modtest.Values{"cache_mb": 2048}))

	if !strings.Contains(string(chosen.Files[confPath]), "cacheSizeGB: 2") {
		t.Fatalf("the chosen size must reach the configuration:\n%s", chosen.Files[confPath])
	}

	floored := newFakeSys()
	install(t, newContextWith(t, floored, modtest.Values{"cache_mb": 64}))

	if !strings.Contains(string(floored.Files[confPath]), "cacheSizeGB: 0.25") {
		t.Fatalf("WiredTiger refuses less than a quarter of a gigabyte:\n%s", floored.Files[confPath])
	}
}

// The version, the port and the user name are the client's call; the repository, the configuration and the url follow.
func TestTheChosenVersionPortAndUserReachTheServer(t *testing.T) {
	fake := newFakeSys()
	fake.Files["/etc/os-release"] = []byte("ID=ubuntu\nVERSION_CODENAME=jammy\n")
	ctx := newContextWith(t, fake, modtest.Values{"version": "7.0", "port": 27018, "app_user": "flyleaf"})

	install(t, ctx)

	list := string(fake.Files["/etc/apt/sources.list.d/mongodb-org-7.0.list"])
	if !strings.Contains(list, "mongodb-org/7.0") {
		t.Fatalf("the chosen major must be the repository added: %q", list)
	}

	if !strings.Contains(string(fake.Files[confPath]), "port: 27018") {
		t.Fatalf("the chosen port must reach the configuration:\n%s", fake.Files[confPath])
	}

	script := ""
	for _, call := range fake.Calls {
		if len(call.Stdin) > 0 {
			script = string(call.Stdin)
		}
	}
	if !strings.Contains(script, `"flyleaf"`) {
		t.Fatalf("the chosen user must be the one created:\n%s", script)
	}

	url, err := URL(ctx, "shop")
	if err != nil || url != "mongodb://flyleaf@127.0.0.1:27018/shop?authSource=admin" {
		t.Fatalf("url = %q, %v", url, err)
	}
}

// A user name reaches the mongosh script as an identifier: what does not look like one is refused before it gets there.
func TestAUserNameThatIsNotAnIdentifierFallsBackOnTheDefault(t *testing.T) {
	ctx := newContextWith(t, newFakeSys(), modtest.Values{"app_user": `app"); db.dropDatabase(); //`})

	if got := appUser(ctx); got != defaultAppUser {
		t.Fatalf("appUser = %q, want %q", got, defaultAppUser)
	}
}

func sentScript(fake *modtest.FakeSys) string {
	var script string
	for _, call := range fake.Calls {
		if len(call.Stdin) > 0 {
			script = string(call.Stdin)
		}
	}

	return script
}

// Once authorization is on, only the previous password opens the user: a rotation that signs in with the new one fails for ever, and the env must not say otherwise.
func TestRotationSignsInWithThePreviousPasswordAndStoresLast(t *testing.T) {
	fake := installedSys(t)
	fake.Files[env.Path] = []byte(appPasswordKey + "=former-password\n")
	fake.FailProgram("mongosh", "MongoServerError: Authentication failed.")
	ctx := newContext(t, fake)

	if err := (Module{}).Configure(ctx); err == nil {
		t.Fatal("configure must fail when the password cannot be changed")
	}

	if fake.EnvValue(appPasswordKey) != "former-password" {
		t.Fatalf("the previous password must stay until the user holds the new one: %s", fake.Files[env.Path])
	}

	script := sentScript(fake)
	previous, next := strings.Index(script, `admin.auth("app", "former-password")`), strings.Index(script, `changeUserPassword("app", password)`)
	if previous < 0 || next < 0 || previous > next {
		t.Fatalf("the script must sign in with the previous password before changing it:\n%s", script)
	}

	delete(fake.Failures, "mongosh")
	again := newContext(t, fake)
	install(t, again)

	if statuses(again)["create-app-user"] != contract.StepOK || statuses(again)["store-password"] != contract.StepOK || fake.EnvValue(appPasswordKey) != appPassword {
		t.Fatalf("the replay must change the password then store it: %v, env %s", statuses(again), fake.Files[env.Path])
	}
}

// A new major beside the running one is a server that will not start on the old files until featureCompatibilityVersion was raised: the form is told so before anything moves.
func TestPreflightRefusesAVersionChangeWhileInstalled(t *testing.T) {
	fake := installedSys(t)
	fake.Files["/etc/os-release"] = []byte("ID=ubuntu\nVERSION_CODENAME=jammy\n")
	ctx := modtest.NewContext(t, fake, modtest.Options{
		Manifest: manifest(),
		Values:   modtest.Values{"version": "7.0"},
		Held:     modtest.Values{"version": DefaultVersion},
	})

	problems := (Module{}).Preflight(ctx)
	if len(problems) != 1 || problems[0].Field != "version" || !strings.Contains(problems[0].Message, "setFeatureCompatibilityVersion") {
		t.Fatalf("problems = %+v", problems)
	}
}

// MongoDB publishes 7.0 for jammy and not for noble: the form is told before anything is written, and so is an install that got past it.
func TestAMajorMongoDBDoesNotPublishForThisReleaseIsRefused(t *testing.T) {
	fake := newFakeSys()
	chosen := modtest.Values{"version": "7.0"}

	problems := (Module{}).Preflight(newContextWith(t, fake, chosen))
	if len(problems) != 1 || problems[0].Field != "version" || problems[0].Code != contract.ProblemOptions ||
		problems[0].Expected != "8.0" || !strings.Contains(problems[0].Message, "noble") {
		t.Fatalf("problems = %+v", problems)
	}

	ctx := newContextWith(t, fake, chosen)
	err := (Module{}).Install(ctx)
	if err == nil || !strings.Contains(err.Error(), "8.0") || statuses(ctx)["add-repository"] != contract.StepFail {
		t.Fatalf("install = %v, steps = %v", err, statuses(ctx))
	}

	if len(fake.Mutations) != 0 {
		t.Fatalf("a refused major must leave the machine untouched: %v", fake.Mutations)
	}

	fake.Files["/etc/os-release"] = []byte("ID=ubuntu\nVERSION_CODENAME=jammy\n")
	if problems := (Module{}).Preflight(newContextWith(t, fake, chosen)); len(problems) != 0 {
		t.Fatalf("7.0 is published for jammy: %+v", problems)
	}
}

func TestEveryOfferedMajorIsPublishedForSomeRelease(t *testing.T) {
	for _, field := range manifest().Fields {
		if field.Key != "version" {
			continue
		}

		for _, major := range field.Options {
			if len(published[major]) == 0 {
				t.Errorf("%s is offered and published for no release", major)
			}
		}
	}
}

// The repository of a major MongoDB does not serve here would fail every later apt-get update on the machine, Caddy's included.
func TestARepositoryAptCannotReadIsTakenBackOut(t *testing.T) {
	fake := newFakeSys()
	fake.FailLine("update -qq", "E: The repository 'https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 Release' does not have a Release file.")
	ctx := newContext(t, fake)

	if err := (Module{}).Install(ctx); err == nil {
		t.Fatal("expected the install to fail")
	}

	for _, path := range []string{defaultList, defaultKeyring} {
		if _, kept := fake.Files[path]; kept {
			t.Errorf("%s must not stay where apt reads it", path)
		}
	}
}

// Uninstalling takes back what the repository brought and the repository itself, so no list of a module gone is read at the next apt-get update.
func TestUninstallTakesBackThePackagesAndTheRepository(t *testing.T) {
	fake := installedSys(t)
	for _, part := range []string{"mongodb-org-server", "mongodb-org-mongos", "mongodb-org-database", "mongodb-org-tools", "mongodb-mongosh", "mongodb-database-tools"} {
		fake.Packages[part] = "8.0.4"
	}
	fake.Packages["mongodb-clients"] = "1:3.6"
	delete(fake.Answers, "mongosh")
	ctx := newContext(t, fake)

	if err := (Module{}).Uninstall(ctx); err != nil {
		t.Fatal(err)
	}

	for name := range fake.Packages {
		if strings.HasPrefix(name, "mongodb-org") || name == "mongodb-mongosh" || name == "mongodb-database-tools" {
			t.Errorf("%s stayed behind", name)
		}
	}

	if _, kept := fake.Packages["mongodb-clients"]; !kept {
		t.Error("a package the module never installed is not its to remove")
	}

	for _, path := range []string{defaultList, defaultKeyring} {
		if _, kept := fake.Files[path]; kept {
			t.Errorf("%s stayed behind", path)
		}
	}
}

func TestInstallingOneVersionDropsTheListOfAnother(t *testing.T) {
	fake := newFakeSys()
	fake.Files["/etc/apt/sources.list.d/mongodb-org-7.0.list"] = repository("7.0", "noble")
	fake.Files[keyringPathOf("7.0")] = []byte("-----BEGIN PGP PUBLIC KEY BLOCK-----\n")
	ctx := newContext(t, fake)

	install(t, ctx)

	if _, kept := fake.Files["/etc/apt/sources.list.d/mongodb-org-7.0.list"]; kept {
		t.Fatal("the list of the previous version would take the next upgrade across a major")
	}
	if _, present := fake.Files[defaultList]; !present {
		t.Fatal("the list of the chosen version must be there")
	}
}

func TestADumpBelongsToDev(t *testing.T) {
	fake := installedSys(t)
	ctx := newContext(t, fake)

	path, _, err := Dump(ctx, "shop")
	if err != nil {
		t.Fatal(err)
	}

	if fake.Owners[dumps.Dir] != "dev:dev" || fake.Owners[path] != "dev:dev" {
		t.Fatalf("~/dumps %q, dump %q: both must belong to dev", fake.Owners[dumps.Dir], fake.Owners[path])
	}
}
