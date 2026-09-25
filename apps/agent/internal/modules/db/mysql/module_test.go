package mysql

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
)

var values = modtest.Values{"engine": "mysql"}

func newContext(t *testing.T, fake *modtest.FakeSys, values modtest.Values) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{
		Manifest: manifest(),
		Values:   values,
		Secrets:  modtest.Secrets{"app_password": appPassword, "remote_password": remotePassword},
	})
}

func newFakeSys() *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Files["/proc/meminfo"] = []byte("MemTotal:       4015000 kB\n")
	fake.Replies["mysql"] = "2\n"

	return fake
}

func installedSys(t *testing.T) *modtest.FakeSys {
	t.Helper()

	fake := newFakeSys()
	fake.Packages[mysqlPackage] = "8.0.36-0ubuntu0.24.04.1"
	fake.Units[mysqlUnit] = modtest.UnitActive
	fake.Files[confPath] = renderConfig(mysqlEngine, DefaultPort, "980M")
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

func TestInstallAndConfigureAreIdempotent(t *testing.T) {
	fake := installedSys(t)
	ctx := newContext(t, fake, values)

	install(t, ctx)

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must change nothing: %v", fake.Mutations)
	}

	if fake.Restarts[mysqlUnit] != 0 {
		t.Fatalf("mysql restarted %d times on an installed machine", fake.Restarts[mysqlUnit])
	}
}

func TestConfigurationBindsToLoopbackOnly(t *testing.T) {
	fake := newFakeSys()
	ctx := newContext(t, fake, values)

	install(t, ctx)

	written := string(fake.Files[confPath])

	for _, want := range []string{"bind-address                   = 127.0.0.1", "skip_name_resolve              = ON", "mysqlx                         = 0"} {
		if !strings.Contains(written, want) {
			t.Errorf("%s missing from %s:\n%s", want, confPath, written)
		}
	}

	if strings.Contains(written, "0.0.0.0") || strings.Contains(written, "::") {
		t.Fatalf("no address but the loopback may appear:\n%s", written)
	}

	if fake.Modes[confPath] != 0o644 {
		t.Fatalf("mode of %s = %v", confPath, fake.Modes[confPath])
	}
}

func TestAChangedConfigurationRestartsTheEngineAndReplaysTheAccounts(t *testing.T) {
	fake := installedSys(t)
	ctx := newContext(t, fake, modtest.Values{"engine": "mysql", "buffer_pool": "2G"})

	install(t, ctx)

	steps := statuses(ctx)
	if steps["write-config"] != contract.StepOK || steps["enable-service"] != contract.StepOK {
		t.Fatalf("a configuration the engine has not read yet is worth a restart: %v", steps)
	}

	if fake.Restarts[mysqlUnit] != 1 {
		t.Fatalf("restarts = %d", fake.Restarts[mysqlUnit])
	}
}

func TestBufferPoolFollowsTheMemoryUnlessTheFieldSaysOtherwise(t *testing.T) {
	fake := newFakeSys()
	install(t, newContext(t, fake, values))

	if !strings.Contains(string(fake.Files[confPath]), "innodb_buffer_pool_size        = 980M") {
		t.Fatalf("a 4 GB machine gets a quarter of its memory:\n%s", fake.Files[confPath])
	}

	chosen := newFakeSys()
	install(t, newContext(t, chosen, modtest.Values{"engine": "mysql", "buffer_pool": "2G"}))

	if !strings.Contains(string(chosen.Files[confPath]), "innodb_buffer_pool_size        = 2G") {
		t.Fatalf("the field wins over the memory:\n%s", chosen.Files[confPath])
	}
}

func TestMariadbIsInstalledAndConfiguredAsSuch(t *testing.T) {
	fake := newFakeSys()
	ctx := newContext(t, fake, modtest.Values{"engine": "mariadb"})

	install(t, ctx)

	if _, installed := fake.Packages[mariadbPackage]; !installed {
		t.Fatalf("mariadb-server must be the package installed: %v", fake.Packages)
	}

	if strings.Contains(string(fake.Files[confPath]), "mysqlx") {
		t.Fatalf("mariadb has no mysqlx plugin:\n%s", fake.Files[confPath])
	}

	if fake.Units[mariadbUnit] != modtest.UnitActive {
		t.Fatalf("the mariadb unit must be the one enabled: %v", fake.Units)
	}
}

func TestNoGeneratedPasswordReachesTheJournalOrTheEvents(t *testing.T) {
	fake := newFakeSys()
	ctx := newContext(t, fake, values)

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
			t.Fatalf("a password must never reach an argv, it would show up in ps: %s", call)
		}
	}

	if fake.EnvValue(appPasswordKey) != appPassword || fake.EnvValue(remotePasswordKey) != remotePassword {
		t.Fatalf("both passwords belong in %s: %s", env.Path, fake.Files[env.Path])
	}

	if fake.Modes[env.Path] != 0o600 {
		t.Fatalf("mode of %s = %v", env.Path, fake.Modes[env.Path])
	}

	if !strings.Contains(string(fake.Files[confPath]), "bind-address") || strings.Contains(string(fake.Files[confPath]), appPassword) {
		t.Fatalf("the configuration carries no password:\n%s", fake.Files[confPath])
	}
}

func TestAccountsAreCreatedForTheAppAndForTheLaptop(t *testing.T) {
	fake := newFakeSys()
	ctx := newContext(t, fake, values)

	install(t, ctx)

	var sql string

	for _, call := range fake.Calls {
		if len(call.Stdin) > 0 {
			sql = string(call.Stdin)
		}
	}

	for _, want := range []string{
		"CREATE USER IF NOT EXISTS 'root'@'127.0.0.1'",
		"CREATE USER IF NOT EXISTS 'dev'@'127.0.0.1'",
		"IDENTIFIED WITH caching_sha2_password BY '" + appPassword + "'",
		"IDENTIFIED BY '" + remotePassword + "'",
	} {
		if !strings.Contains(sql, want) {
			t.Errorf("the accounts SQL lacks %q:\n%s", want, sql)
		}
	}

	if strings.Contains(sql, "'%'") {
		t.Fatalf("no account may open beyond the loopback:\n%s", sql)
	}
}

func TestDumpsLeftBeforeTheInstallAreImportedAndNamedInTheReport(t *testing.T) {
	fake := newFakeSys()
	fake.Dirs[dumps.Dir] = true
	fake.Replies["find"] = dumps.Dir + "/fulldump_shop_20260101.sql\x00"
	ctx := newContext(t, fake, values)

	install(t, ctx)

	if statuses(ctx)["import-shop"] != contract.StepOK {
		t.Fatalf("the report must name the imported database: %+v", ctx.Events())
	}

	var loaded string

	for _, call := range fake.Calls {
		if call.StdinPath != "" {
			loaded = strings.Join(call.Argv, " ") + " < " + call.StdinPath
		}
	}

	if loaded != "mysql --protocol=socket --default-character-set=utf8mb4 shop < "+dumps.Dir+"/fulldump_shop_20260101.sql" {
		t.Fatalf("the dump must be streamed into its database, got %q", loaded)
	}

	replayed := newContext(t, fake, values)
	install(t, replayed)

	if statuses(replayed)["import-dumps"] != contract.StepSkip {
		t.Fatalf("an imported dump is never imported twice: %+v", replayed.Events())
	}
}

func TestUrlOpensTheRemoteAccountThroughSshForward(t *testing.T) {
	fake := installedSys(t)
	ctx := newContext(t, fake, values)

	url, err := URL(ctx, "shop")
	if err != nil {
		t.Fatal(err)
	}

	if url != "mysql://dev@127.0.0.1:3306/shop" {
		t.Fatalf("url = %q", url)
	}

	if strings.Contains(url, appPassword) || strings.Contains(url, remotePassword) {
		t.Fatal("an url carries no password")
	}

	empty, err := URL(ctx, "")
	if err != nil || empty != "mysql://dev@127.0.0.1:3306/mysql" {
		t.Fatalf("url without a name = %q, %v", empty, err)
	}

	if _, err := URL(newContext(t, newFakeSys(), values), "shop"); err == nil {
		t.Fatal("an engine that is not installed must say so")
	}
}

func TestShellAndDumpStayOnTheSocketAccount(t *testing.T) {
	fake := installedSys(t)
	ctx := newContext(t, fake, values)

	command, err := Shell(ctx, "shop")
	if err != nil {
		t.Fatal(err)
	}

	if command != "sudo mysql shop" {
		t.Fatalf("shell = %q", command)
	}

	path, size, err := Dump(ctx, "shop")
	if err != nil {
		t.Fatal(err)
	}

	if path != dumps.Dir+"/shop_20260904-1200.sql" || size != int64(len("dump")) || string(fake.Files[path]) != "dump" {
		t.Fatalf("dump = %q, %d", path, size)
	}

	var dumped string

	for _, call := range fake.Calls {
		if call.Argv[0] == "mysqldump" {
			dumped = strings.Join(call.Argv, " ")
		}
	}

	if strings.Contains(dumped, "--result-file") || !strings.Contains(dumped, "--single-transaction") {
		t.Fatalf("mysqldump prints the dump, root writes it where no link of dev's leads: %q", dumped)
	}
}

func TestFailedStepReportsItsReplayCommand(t *testing.T) {
	fake := newFakeSys()
	fake.FailPackage(mysqlPackage, "E: Unable to locate package mysql-server")
	fake.FailPackage(mariadbPackage, "E: Unable to locate package mariadb-server")
	ctx := newContext(t, fake, values)

	if err := (Module{}).Install(ctx); err == nil {
		t.Fatal("expected the install to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only=db.mysql" {
		t.Fatalf("unexpected event: %+v", last)
	}
}

func TestUninstallLeavesTheDataAlone(t *testing.T) {
	fake := installedSys(t)
	ctx := newContext(t, fake, values)

	if err := (Module{}).Uninstall(ctx); err != nil {
		t.Fatal(err)
	}

	if _, kept := fake.Packages[mysqlPackage]; kept {
		t.Fatal("the package the module installed must go")
	}

	if _, kept := fake.Files[confPath]; kept {
		t.Fatal("the configuration the module wrote must go")
	}

	if fake.EnvValue(appPasswordKey) != "" || fake.EnvValue(remotePasswordKey) != "" {
		t.Fatalf("the keys of the module must leave %s: %s", env.Path, fake.Files[env.Path])
	}

	for _, mutation := range fake.Mutations {
		if strings.Contains(mutation, "/var/lib/mysql") {
			t.Fatalf("the client's data is never touched: %s", mutation)
		}
	}
}

func TestStatusNamesTheKeysNotTheSecrets(t *testing.T) {
	fake := installedSys(t)
	ctx := newContext(t, fake, values)

	status, err := (Module{}).Status(ctx)
	if err != nil {
		t.Fatal(err)
	}

	if !status.Installed || status.State != contract.ServiceRunning || status.Port != DefaultPort || status.Unit != mysqlUnit {
		t.Fatalf("status = %+v", status)
	}

	for _, value := range status.Credentials {
		if value != appPasswordKey && value != remotePasswordKey {
			t.Fatalf("credentials must name the keys of %s, got %q", env.Path, value)
		}
	}

	service := status.Service(manifest())
	if service.ID != ID || service.Version != "8.0.36-0ubuntu0.24.04.1" {
		t.Fatalf("service = %+v", service)
	}
}

var _ modules.Module = Module{}

func TestTheChosenPortAndAccountsReachTheEngine(t *testing.T) {
	fake := newFakeSys()
	ctx := newContext(t, fake, modtest.Values{
		"engine": mysqlEngine, "port": 3307, "app_user": "flyleaf", "remote_user": "laptop",
	})

	install(t, ctx)

	written := string(fake.Files[confPath])
	if !strings.Contains(written, "port                           = 3307") {
		t.Fatalf("the chosen port must reach the configuration:\n%s", written)
	}

	sql := ""

	for _, call := range fake.Calls {
		if len(call.Stdin) > 0 {
			sql = string(call.Stdin)
		}
	}

	for _, want := range []string{"'flyleaf'@'127.0.0.1'", "'laptop'@'127.0.0.1'"} {
		if !strings.Contains(sql, want) {
			t.Errorf("the chosen accounts must be the ones created, %q missing:\n%s", want, sql)
		}
	}

	url, err := URL(ctx, "shop")
	if err != nil || url != "mysql://laptop@127.0.0.1:3307/shop" {
		t.Fatalf("url = %q, %v", url, err)
	}
}

func TestAnAccountNameThatIsNotAnIdentifierFallsBackOnTheDefault(t *testing.T) {
	ctx := newContext(t, newFakeSys(), modtest.Values{"app_user": "root'; DROP DATABASE mysql; --"})

	if got := appAccount(ctx); got != defaultAppAccount {
		t.Fatalf("appAccount = %q, want %q", got, defaultAppAccount)
	}
}

func sentSQL(fake *modtest.FakeSys) string {
	var sql string

	for _, call := range fake.Calls {
		if len(call.Stdin) > 0 {
			sql = string(call.Stdin)
		}
	}

	return sql
}

func TestMariadbAccountsUseItsOwnGrammar(t *testing.T) {
	fake := newFakeSys()
	fake.Packages[mariadbPackage] = "1:10.11.8-0ubuntu0.24.04.1"
	ctx := newContext(t, fake, modtest.Values{"engine": "mariadb"})

	install(t, ctx)

	want := strings.Join([]string{
		"CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' IDENTIFIED BY '" + appPassword + "';",
		"ALTER USER 'root'@'127.0.0.1' IDENTIFIED BY '" + appPassword + "';",
		"GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;",
		"CREATE USER IF NOT EXISTS 'dev'@'127.0.0.1' IDENTIFIED BY '" + remotePassword + "';",
		"ALTER USER 'dev'@'127.0.0.1' IDENTIFIED BY '" + remotePassword + "';",
		"GRANT ALL PRIVILEGES ON *.* TO 'dev'@'127.0.0.1' WITH GRANT OPTION;",
		"FLUSH PRIVILEGES;",
		"",
	}, "\n")
	if got := sentSQL(fake); got != want {
		t.Fatalf("mariadb SQL:\n%s\nwant:\n%s", got, want)
	}
}

func TestPreflightRefusesAnEngineSwitchOnAnInstalledMachine(t *testing.T) {
	fake := installedSys(t)
	ctx := modtest.NewContext(t, fake, modtest.Options{
		Manifest: manifest(),
		Values:   modtest.Values{"engine": "mariadb"},
		Held:     modtest.Values{"engine": "mysql"},
	})

	problems := (Module{}).Preflight(ctx)
	if len(problems) != 1 || problems[0].Field != "engine" || !strings.Contains(problems[0].Message, "mysql") {
		t.Fatalf("problems = %+v", problems)
	}

	same := modtest.NewContext(t, fake, modtest.Options{
		Manifest: manifest(),
		Values:   modtest.Values{"engine": "mysql", "port": 3307},
		Held:     modtest.Values{"engine": "mysql"},
	})
	if problems := (Module{}).Preflight(same); len(problems) != 0 {
		t.Fatalf("the same engine on another port is not a switch: %+v", problems)
	}
}

func TestPasswordsAreStoredOnlyOnceTheAccountsHoldThem(t *testing.T) {
	fake := installedSys(t)
	fake.Files[env.Path] = []byte(appPasswordKey + "=former-app\n" + remotePasswordKey + "=former-remote\n")
	fake.FailProgram("mysql", "ERROR 2002 (HY000): Can't connect to local MySQL server through socket")
	ctx := newContext(t, fake, values)

	if err := (Module{}).Configure(ctx); err == nil {
		t.Fatal("configure must fail when the accounts cannot be altered")
	}

	if fake.EnvValue(appPasswordKey) != "former-app" || fake.EnvValue(remotePasswordKey) != "former-remote" {
		t.Fatalf("the previous passwords must stay until the accounts hold the new ones: %s", fake.Files[env.Path])
	}

	delete(fake.Failures, "mysql")
	again := newContext(t, fake, values)
	install(t, again)

	if statuses(again)["create-accounts"] != contract.StepOK || statuses(again)["store-passwords"] != contract.StepOK {
		t.Fatalf("the replay must alter the accounts then store: %v", statuses(again))
	}

	if !strings.Contains(sentSQL(fake), "BY '"+appPassword+"'") || fake.EnvValue(appPasswordKey) != appPassword {
		t.Fatalf("accounts or env missed the new password: env %s", fake.Files[env.Path])
	}
}

func TestADumpBelongsToDev(t *testing.T) {
	fake := installedSys(t)
	fake.Replies["stat"] = "4096\n"
	ctx := newContext(t, fake, values)

	path, _, err := Dump(ctx, "shop")
	if err != nil {
		t.Fatal(err)
	}

	if fake.Owners[dumps.Dir] != "dev:dev" || fake.Owners[path] != "dev:dev" {
		t.Fatalf("~/dumps %q, dump %q: both must belong to dev", fake.Owners[dumps.Dir], fake.Owners[path])
	}
}
