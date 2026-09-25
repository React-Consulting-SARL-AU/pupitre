package postgres

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/db/dumps"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sys/env"
)

const (
	appPassword    = "s3cret-de-test-app"
	remotePassword = "s3cret-de-test-remote"

	defaultPkg     = "postgresql-" + DefaultVersion
	defaultCluster = "/etc/postgresql/" + DefaultVersion + "/main"
	defaultConf    = defaultCluster + "/conf.d/99-pupitre.conf"
	defaultHba     = defaultCluster + "/pg_hba.conf"
)

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{
		Manifest: manifest(),
		Secrets:  modtest.Secrets{"app_password": appPassword, "remote_password": remotePassword},
	})
}

func newFakeSys() *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Files["/proc/meminfo"] = []byte("MemTotal:       4015000 kB\n")
	fake.Files["/etc/os-release"] = []byte("ID=ubuntu\nVERSION_CODENAME=noble\n")
	fake.Answer("FROM pg_roles", "2\n")
	fake.Answer("FROM pg_extension", "3\n")
	fake.Answer("FROM pg_database", "1\n")

	return fake
}

func installedSys(t *testing.T) *modtest.FakeSys {
	t.Helper()

	fake := newFakeSys()
	fake.Packages[defaultPkg] = "17.2-1.pgdg24.04+1"
	fake.Units[unit] = modtest.UnitActive
	fake.Files[keyringPath] = []byte("-----BEGIN PGP PUBLIC KEY BLOCK-----\n")
	fake.Files[listPath] = repository("noble")
	fake.Files[defaultConf] = renderConfig(DefaultPort, "980MB")
	fake.Files[defaultHba] = []byte("local   all             postgres                                peer\n" + hbaLine + "\n")
	fake.Files[env.Path] = []byte(appPasswordKey + "=" + appPassword + "\n" + remotePasswordKey + "=" + remotePassword + "\n")

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

func stdin(fake *modtest.FakeSys) string {
	var sql string
	for _, call := range fake.Calls {
		if len(call.Stdin) > 0 {
			sql += string(call.Stdin)
		}
	}

	return sql
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
		t.Fatalf("postgres restarted %d times on an installed machine", fake.Restarts[unit])
	}
}

func TestPostgresListensOnTheLoopbackOnly(t *testing.T) {
	fake := newFakeSys()
	fake.Files[defaultHba] = []byte("local   all             postgres                                peer\n")
	ctx := newContext(t, fake)

	install(t, ctx)

	written := string(fake.Files[defaultConf])
	if !strings.Contains(written, "listen_addresses = '127.0.0.1'") {
		t.Fatalf("%s must bind the loopback:\n%s", defaultConf, written)
	}

	if strings.Contains(written, "0.0.0.0") || strings.Contains(written, "'*'") {
		t.Fatalf("no address but the loopback may appear:\n%s", written)
	}

	hba := string(fake.Files[defaultHba])
	if !strings.Contains(hba, "host    all             all             127.0.0.1/32            scram-sha-256") {
		t.Fatalf("%s must let the loopback in, and only it:\n%s", defaultHba, hba)
	}

	if !strings.Contains(written, "shared_buffers = 980MB") {
		t.Fatalf("shared_buffers follows the memory:\n%s", written)
	}
}

func TestPostgres17ComesFromItsOwnRepository(t *testing.T) {
	fake := newFakeSys()
	ctx := newContext(t, fake)

	install(t, ctx)

	if got := string(fake.Files[listPath]); got != string(repository("noble")) {
		t.Fatalf("%s = %q", listPath, got)
	}

	var fetched string
	for _, call := range fake.Commands() {
		if strings.HasPrefix(call, "curl") {
			fetched = call
		}
	}

	if !strings.Contains(fetched, keyringPath) || !strings.Contains(fetched, "https://www.postgresql.org/media/keys/") {
		t.Fatalf("the repository key is fetched over https into the keyring: %q", fetched)
	}

	if _, installed := fake.Packages[defaultPkg]; !installed {
		t.Fatalf("%s must be installed: %v", defaultPkg, fake.Packages)
	}
}

func TestNoGeneratedPasswordReachesTheJournalOrTheEvents(t *testing.T) {
	fake := newFakeSys()
	ctx := newContext(t, fake)

	install(t, ctx)

	for _, line := range ctx.Output() {
		if strings.Contains(line, appPassword) || strings.Contains(line, remotePassword) {
			t.Fatalf("secret in the journal: %s", line)
		}
	}

	for _, event := range ctx.Events() {
		if strings.Contains(event.Step+event.Replay, appPassword) || strings.Contains(event.Step+event.Replay, remotePassword) {
			t.Fatalf("secret in an event: %+v", event)
		}
	}

	for _, call := range fake.Commands() {
		if strings.Contains(call, appPassword) || strings.Contains(call, remotePassword) {
			t.Fatalf("a password must never reach an argv: %s", call)
		}
	}

	if fake.EnvValue(appPasswordKey) != appPassword || fake.EnvValue(remotePasswordKey) != remotePassword {
		t.Fatalf("both passwords belong in %s: %s", env.Path, fake.Files[env.Path])
	}

	if strings.Contains(string(fake.Files[defaultConf]), appPassword) {
		t.Fatal("the configuration carries no password")
	}
}

func TestRolesAreCreatedForTheAppAndForTheLaptop(t *testing.T) {
	fake := newFakeSys()
	fake.Answer("FROM pg_roles", "0\n")
	ctx := newContext(t, fake)

	install(t, ctx)

	sql := stdin(fake)
	for _, want := range []string{
		`CREATE ROLE "app" LOGIN CREATEDB`,
		`CREATE ROLE "dev" LOGIN CREATEDB`,
		`ALTER ROLE "app" WITH LOGIN CREATEDB PASSWORD '` + appPassword + `'`,
		`ALTER ROLE "dev" WITH LOGIN CREATEDB PASSWORD '` + remotePassword + `'`,
	} {
		if !strings.Contains(sql, want) {
			t.Errorf("the roles SQL lacks %q:\n%s", want, sql)
		}
	}

	if strings.Contains(sql, "SUPERUSER") {
		t.Fatalf("neither role is a superuser:\n%s", sql)
	}

	for _, call := range fake.Calls {
		if len(call.Stdin) > 0 && call.User != "postgres" {
			t.Fatalf("psql speaks as postgres on the socket, got user %q", call.User)
		}
	}
}

func TestQuotesInAPasswordAreEscapedForPostgres(t *testing.T) {
	if got := quote("a'b\\c"); got != "a''b\\c" {
		t.Fatalf("quote = %q", got)
	}
}

func TestCommonExtensionsAreInstalledOnce(t *testing.T) {
	fake := newFakeSys()
	fake.Answer("FROM pg_extension", "0\n")
	ctx := newContext(t, fake)

	install(t, ctx)

	joined := strings.Join(fake.Commands(), "\n")
	for _, extension := range extensions {
		if !strings.Contains(joined, `CREATE EXTENSION IF NOT EXISTS "`+extension+`"`) {
			t.Errorf("%s must be created in template1:\n%s", extension, joined)
		}
	}

	if statuses(ctx)["install-extensions"] != contract.StepOK {
		t.Fatalf("events = %+v", ctx.Events())
	}

	ready := newContext(t, newFakeSys())
	install(t, ready)
	if statuses(ready)["install-extensions"] != contract.StepSkip {
		t.Fatalf("extensions already there are not created again: %+v", ready.Events())
	}
}

func TestDumpsLeftBeforeTheInstallAreImportedAndNamedInTheReport(t *testing.T) {
	fake := newFakeSys()
	fake.Dirs[dumps.Dir] = true
	fake.Answer("FROM pg_database", "\n")
	fake.Replies["find"] = dumps.Dir + "/fulldump_shop_20260101.sql\x00" + dumps.Dir + "/intranet.dump\x00"
	ctx := newContext(t, fake)

	install(t, ctx)

	steps := statuses(ctx)
	if steps["import-shop"] != contract.StepOK || steps["import-intranet"] != contract.StepOK {
		t.Fatalf("the report must name each imported database: %+v", ctx.Events())
	}

	// ~dev is 0750: the postgres account cannot open the dump itself, so root opens it on the standard input.
	joined := strings.Join(fake.Commands(), "\n")
	for _, want := range []string{
		"createdb --owner=app shop",
		"(postgres) psql -v ON_ERROR_STOP=1 --dbname=shop < " + dumps.Dir + "/fulldump_shop_20260101.sql",
		"(postgres) pg_restore --no-owner --dbname=intranet < " + dumps.Dir + "/intranet.dump",
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("%q missing from:\n%s", want, joined)
		}
	}

	if strings.Contains(joined, "--file=") || strings.Contains(joined, "--dbname=intranet "+dumps.Dir) {
		t.Fatalf("a dump path must never reach the argv of the postgres account:\n%s", joined)
	}
}

func TestUrlOpensTheRemoteRoleThroughSshForward(t *testing.T) {
	ctx := newContext(t, installedSys(t))

	url, err := URL(ctx, "shop")
	if err != nil {
		t.Fatal(err)
	}

	if url != "postgresql://dev@127.0.0.1:5432/shop" {
		t.Fatalf("url = %q", url)
	}

	if strings.Contains(url, appPassword) || strings.Contains(url, remotePassword) {
		t.Fatal("an url carries no password")
	}

	empty, err := URL(ctx, "")
	if err != nil || empty != "postgresql://dev@127.0.0.1:5432/postgres" {
		t.Fatalf("url without a name = %q, %v", empty, err)
	}

	if _, err := URL(newContext(t, newFakeSys()), "shop"); err == nil {
		t.Fatal("an engine that is not installed must say so")
	}
}

func TestShellAndDumpStayOnTheSocketAccount(t *testing.T) {
	fake := installedSys(t)
	ctx := newContext(t, fake)

	command, err := Shell(ctx, "shop")
	if err != nil {
		t.Fatal(err)
	}
	if command != "sudo -u postgres psql shop" {
		t.Fatalf("shell = %q", command)
	}

	path, size, err := Dump(ctx, "shop")
	if err != nil {
		t.Fatal(err)
	}

	if path != dumps.Dir+"/shop_20260904-1200.dump" || size != int64(len("dump")) || string(fake.Files[path]) != "dump" {
		t.Fatalf("dump = %q, %d", path, size)
	}

	var dumped string
	for _, call := range fake.Calls {
		if call.Argv[0] == "pg_dump" {
			dumped = strings.Join(call.Argv, " ")
		}
	}

	for _, want := range []string{"--format=custom", "--username=app", "--host=127.0.0.1", "shop"} {
		if !strings.Contains(dumped, want) {
			t.Errorf("pg_dump lacks %q: %q", want, dumped)
		}
	}

	if strings.Contains(dumped, "--file") {
		t.Fatalf("pg_dump prints the dump, root writes it where no link of dev's leads: %q", dumped)
	}

	if strings.Contains(dumped, appPassword) {
		t.Fatal("the password of a dump goes through the environment, never through an argv")
	}
}

func TestFailedStepReportsItsReplayCommand(t *testing.T) {
	fake := newFakeSys()
	fake.FailPackage(defaultPkg, "E: Unable to locate package postgresql-17")
	ctx := newContext(t, fake)

	if err := (Module{}).Install(ctx); err == nil {
		t.Fatal("expected the install to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only=db.postgres" {
		t.Fatalf("unexpected event: %+v", last)
	}
}

func TestUninstallLeavesTheDataAlone(t *testing.T) {
	fake := installedSys(t)
	ctx := newContext(t, fake)

	if err := (Module{}).Uninstall(ctx); err != nil {
		t.Fatal(err)
	}

	if _, kept := fake.Packages[defaultPkg]; kept {
		t.Fatal("the package the module installed must go")
	}

	if _, kept := fake.Files[defaultConf]; kept {
		t.Fatal("the configuration the module wrote must go")
	}

	if fake.EnvValue(appPasswordKey) != "" || fake.EnvValue(remotePasswordKey) != "" {
		t.Fatalf("the keys of the module must leave %s: %s", env.Path, fake.Files[env.Path])
	}

	for _, mutation := range fake.Mutations {
		if strings.Contains(mutation, "/var/lib/postgresql") {
			t.Fatalf("the client's data is never touched: %s", mutation)
		}
	}
}

func TestStatusNamesTheKeysNotTheSecrets(t *testing.T) {
	ctx := newContext(t, installedSys(t))

	status, err := (Module{}).Status(ctx)
	if err != nil {
		t.Fatal(err)
	}

	if !status.Installed || status.State != contract.ServiceRunning || status.Port != DefaultPort || status.Unit != unit {
		t.Fatalf("status = %+v", status)
	}

	for _, value := range status.Credentials {
		if value != appPasswordKey && value != remotePasswordKey {
			t.Fatalf("credentials must name the keys of %s, got %q", env.Path, value)
		}
	}
}

var _ modules.Module = Module{}

func newContextWith(t *testing.T, fake *modtest.FakeSys, values modtest.Values) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{
		Manifest: manifest(),
		Values:   values,
		Secrets:  modtest.Secrets{"app_password": appPassword, "remote_password": remotePassword},
	})
}

// The version, the port and the two role names are the client's call; the cluster the module writes into follows.
func TestTheChosenVersionPortAndRolesReachTheCluster(t *testing.T) {
	fake := newFakeSys()
	fake.Answer("FROM pg_roles", "0\n")
	ctx := newContextWith(t, fake, modtest.Values{
		"version": "16", "port": 5433, "app_role": "flyleaf", "remote_role": "laptop",
	})

	install(t, ctx)

	if _, installed := fake.Packages["postgresql-16"]; !installed {
		t.Fatalf("the chosen major must be the package installed: %v", fake.Packages)
	}

	written := string(fake.Files["/etc/postgresql/16/main/conf.d/99-pupitre.conf"])
	if !strings.Contains(written, "port = 5433") {
		t.Fatalf("the chosen port must reach the configuration:\n%s", written)
	}

	roles := strings.Join(fake.Commands(), "\n")
	if !strings.Contains(roles, "psql") {
		t.Fatalf("the roles must be created:\n%s", roles)
	}

	url, err := URL(ctx, "shop")
	if err != nil || url != "postgresql://laptop@127.0.0.1:5433/shop" {
		t.Fatalf("url = %q, %v", url, err)
	}
}

// Buffers left empty follow the machine; a size given follows the client, whose database may be the whole point of the server.
func TestTheChosenSharedBuffersOverrideTheMemorySizing(t *testing.T) {
	fake := newFakeSys()
	fake.Answer("FROM pg_roles", "0\n")
	ctx := newContextWith(t, fake, modtest.Values{"shared_buffers": "3GB"})

	install(t, ctx)

	written := string(fake.Files[defaultConf])
	if !strings.Contains(written, "shared_buffers = 3GB") {
		t.Fatalf("the chosen size must reach the configuration:\n%s", written)
	}
}

// A role name reaches SQL as an identifier: what does not look like one is refused before it gets there.
func TestARoleNameThatIsNotAnIdentifierFallsBackOnTheDefault(t *testing.T) {
	fake := newFakeSys()
	ctx := newContextWith(t, fake, modtest.Values{"app_role": `dev"; DROP DATABASE postgres; --`})

	if got := appRole(ctx); got != defaultAppRole {
		t.Fatalf("appRole = %q, want %q", got, defaultAppRole)
	}
}

// A second major installed beside the first is a second cluster fighting for the port, with the data left on the old one.
func TestPreflightRefusesAVersionChangeWhileAnotherMajorIsInstalled(t *testing.T) {
	fake := installedSys(t)
	ctx := modtest.NewContext(t, fake, modtest.Options{
		Manifest: manifest(),
		Values:   modtest.Values{"version": "18"},
		Held:     modtest.Values{"version": DefaultVersion},
	})

	problems := (Module{}).Preflight(ctx)
	if len(problems) != 1 || problems[0].Field != "version" || !strings.Contains(problems[0].Message, "pg_upgradecluster") {
		t.Fatalf("problems = %+v", problems)
	}

	same := modtest.NewContext(t, fake, modtest.Options{
		Manifest: manifest(),
		Values:   modtest.Values{"version": DefaultVersion, "port": 5433},
		Held:     modtest.Values{"version": DefaultVersion},
	})
	if problems := (Module{}).Preflight(same); len(problems) != 0 {
		t.Fatalf("the same major with another port is not a version change: %+v", problems)
	}
}

// A password written to /etc/pupitre/env before the roles hold it is a password the replay believes applied.
func TestPasswordsAreStoredOnlyOnceTheRolesHoldThem(t *testing.T) {
	fake := installedSys(t)
	fake.Files[env.Path] = []byte(appPasswordKey + "=former-app\n" + remotePasswordKey + "=former-remote\n")
	fake.FailProgram("psql", "psql: error: connection to server on socket failed")
	ctx := newContext(t, fake)

	if err := (Module{}).Configure(ctx); err == nil {
		t.Fatal("configure must fail when the roles cannot be altered")
	}

	if fake.EnvValue(appPasswordKey) != "former-app" || fake.EnvValue(remotePasswordKey) != "former-remote" {
		t.Fatalf("the previous passwords must stay until the roles hold the new ones: %s", fake.Files[env.Path])
	}

	delete(fake.Failures, "psql")
	again := newContext(t, fake)
	install(t, again)

	if statuses(again)["create-roles"] != contract.StepOK || statuses(again)["store-passwords"] != contract.StepOK {
		t.Fatalf("the replay must alter the roles then store: %v", statuses(again))
	}
	if !strings.Contains(stdin(fake), `PASSWORD '`+appPassword+`'`) || fake.EnvValue(appPasswordKey) != appPassword {
		t.Fatalf("roles or env missed the new password: env %s", fake.Files[env.Path])
	}
}

func TestADumpBelongsToDev(t *testing.T) {
	fake := installedSys(t)
	fake.Answer("stat", "8192\n")
	ctx := newContext(t, fake)

	path, _, err := Dump(ctx, "shop")
	if err != nil {
		t.Fatal(err)
	}

	if fake.Owners[dumps.Dir] != "dev:dev" || fake.Owners[path] != "dev:dev" {
		t.Fatalf("~/dumps %q, dump %q: both must belong to dev", fake.Owners[dumps.Dir], fake.Owners[path])
	}
}
