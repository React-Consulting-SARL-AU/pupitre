package mysql

import (
	"errors"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/db/dumps"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/host"
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	DefaultPort = 3306

	mysqlEngine   = "mysql"
	mariadbEngine = "mariadb"

	mysqlPackage   = "mysql-server"
	mariadbPackage = "mariadb-server"
	mysqlUnit      = "mysql"
	mariadbUnit    = "mariadb"

	confDir  = "/etc/mysql/conf.d"
	confPath = confDir + "/99-pupitre.cnf"

	appPasswordKey    = "MYSQL_APP_PASSWORD"
	remotePasswordKey = "MYSQL_REMOTE_PASSWORD"

	defaultAppAccount    = "root"
	defaultRemoteAccount = "dev"

	loopback        = "127.0.0.1"
	defaultDatabase = "mysql"

	poolDivisor   = 4
	minPoolMB     = 128
	maxPoolMB     = 8192
	fallbackRAMKB = 2 * 1024 * 1024
)

// skip_name_resolve: a TCP connection from 127.0.0.1 resolved to "localhost" would land on the socket-only account.
const configTemplate = `[mysqld]
bind-address                   = 127.0.0.1
port                           = %d
max_connections                = 200
innodb_buffer_pool_size        = %s
innodb_flush_log_at_trx_commit = 2
character-set-server           = utf8mb4
collation-server               = utf8mb4_unicode_ci
local_infile                   = 1
skip_name_resolve              = ON
`

var accountPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,31}$`)

const mysqlxOff = "mysqlx                         = 0\n"

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Preflight(ctx *modules.Context) []contract.FieldProblem {
	return modules.Problems(modules.PortTaken(ctx, "port"), engineChanged(ctx))
}

// The installed engine wins whatever the form says, so a switch is refused rather than silently ignored.
func engineChanged(ctx *modules.Context) *contract.FieldProblem {
	installed := installedPackage(ctx)
	if ctx.Held("engine") == nil || installed == "" {
		return nil
	}

	running := mysqlEngine
	if installed == mariadbPackage {
		running = mariadbEngine
	}

	if ctx.String("engine") == running {
		return nil
	}

	return &contract.FieldProblem{
		Module:  ID,
		Field:   "engine",
		Code:    contract.ProblemOptions,
		Message: i18n.T("field.mysql.engine.held", running, ctx.String("engine")),
	}
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	pkg := installedPackage(ctx)
	if pkg == "" {
		return modules.Status{}, nil
	}

	version, err := apt.Version(ctx, pkg)
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{Installed: true, Version: version, Configured: file.Exists(ctx, confPath)}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return ctx.Step("install-engine", func() (modules.Outcome, error) {
		if installedPackage(ctx) != "" {
			return modules.Skipped, nil
		}

		chosen, fallback := packages(ctx.String("engine"))
		err := apt.Install(ctx, chosen)
		if err == nil {
			return modules.Done, nil
		}

		if second := apt.Install(ctx, fallback); second != nil {
			return modules.Failed, err
		}

		ctx.Warn(i18n.T("warn.mysql.fallback", fallback, chosen))

		return modules.Done, nil
	})
}

func (m Module) Configure(ctx *modules.Context) error {
	changed, err := writeConfig(ctx)
	if err != nil {
		return err
	}

	if err := restart(ctx, changed); err != nil {
		return err
	}

	// The accounts take the new passwords before the env does, so a replay after a crash alters them again.
	if err := createAccounts(ctx, passwordsChanged(ctx)); err != nil {
		return err
	}

	if err := storePasswords(ctx); err != nil {
		return err
	}

	_, err = importDumps(ctx, dumps.Options{})

	return err
}

func writeConfig(ctx *modules.Context) (bool, error) {
	content := renderConfig(engineOf(ctx), port(ctx), bufferPool(ctx))
	changed := false

	err := ctx.Step("write-config", func() (modules.Outcome, error) {
		if file.Same(ctx, confPath, content) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(confDir, 0o755); err != nil {
			return modules.Failed, err
		}

		changed = true

		return modules.Done, file.WriteAtomic(ctx, confPath, content, 0o644)
	})

	return changed, err
}

func restart(ctx *modules.Context, changed bool) error {
	unit := unitOf(ctx)

	return ctx.Step("enable-service", func() (modules.Outcome, error) {
		if systemd.Active(ctx, unit) && !changed {
			return modules.Skipped, nil
		}

		if err := systemd.Enable(ctx, unit); err != nil {
			return modules.Failed, err
		}

		return modules.Done, systemd.Restart(ctx, unit)
	})
}

var passwordKeys = map[string]string{appPasswordKey: "app_password", remotePasswordKey: "remote_password"}

func passwordsChanged(ctx *modules.Context) bool {
	for key, secret := range passwordKeys {
		if held, _, err := env.Get(ctx, key); err != nil || held != ctx.Secret(secret) {
			return true
		}
	}

	return false
}

func storePasswords(ctx *modules.Context) error {
	return ctx.Step("store-passwords", func() (modules.Outcome, error) {
		stored := false

		for key, secret := range passwordKeys {
			changed, err := env.Set(ctx, key, ctx.Secret(secret))
			if err != nil {
				return modules.Failed, err
			}

			stored = stored || changed
		}

		if !stored {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

// The passwords go on stdin: an argv would show them in ps and in the journal.
func createAccounts(ctx *modules.Context, rotated bool) error {
	return ctx.Step("create-accounts", func() (modules.Outcome, error) {
		if !rotated && accountsExist(ctx) {
			return modules.Skipped, nil
		}

		sql := renderAccounts(engineOf(ctx), appAccount(ctx), remoteAccount(ctx), ctx.Secret("app_password"), ctx.Secret("remote_password"))
		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"mysql", "--protocol=socket"}, Stdin: []byte(sql)}); err != nil {
			return modules.Failed, errors.New(i18n.T("modules.mysql.accounts_refused", unitOf(ctx), err.Error()))
		}

		return modules.Done, nil
	})
}

func importDumps(ctx *modules.Context, options dumps.Options) ([]string, error) {
	options.Patterns = []string{"*.sql", "*.sql.gz"}
	options.Load = func(dump dumps.File) error {
		if err := createDatabase(ctx, dump.Database); err != nil {
			return err
		}

		_, err := sys.Exec(ctx, sys.Command{
			Argv:      []string{"mysql", "--protocol=socket", "--default-character-set=utf8mb4", dump.Database},
			StdinPath: dump.Path,
		})

		return err
	}

	return dumps.Import(ctx, options)
}

func createDatabase(ctx *modules.Context, name string) error {
	statement := "CREATE DATABASE IF NOT EXISTS `" + name + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
	_, err := sys.Exec(ctx, sys.Command{Argv: []string{"mysql", "--protocol=socket", "-e", statement}})

	return err
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-engine", func() (modules.Outcome, error) {
		pkg := installedPackage(ctx)
		if pkg == "" {
			return modules.Skipped, nil
		}

		upgraded, err := apt.Upgrade(ctx, pkg)
		if err != nil {
			return modules.Failed, err
		}

		if !upgraded {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The data directory and the dumps belong to the client, and stay.
func (Module) Uninstall(ctx *modules.Context) error {
	unit := unitOf(ctx)

	if err := ctx.Step("stop-service", func() (modules.Outcome, error) {
		if !systemd.Active(ctx, unit) {
			return modules.Skipped, nil
		}

		return modules.Done, systemd.Disable(ctx, unit)
	}); err != nil {
		return err
	}

	if err := ctx.Step("remove-package", func() (modules.Outcome, error) {
		pkg := installedPackage(ctx)
		if pkg == "" {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Remove(ctx, pkg)
	}); err != nil {
		return err
	}

	if err := ctx.Step("remove-config", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, confPath)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return ctx.Step("forget-passwords", func() (modules.Outcome, error) {
		forgotten := false

		for _, key := range []string{appPasswordKey, remotePasswordKey} {
			removed, err := env.Unset(ctx, key)
			if err != nil {
				return modules.Failed, err
			}

			forgotten = forgotten || removed
		}

		if !forgotten {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func (m Module) Status(ctx *modules.Context) (modules.Status, error) {
	status, err := m.Check(ctx)
	if err != nil {
		return modules.Status{}, err
	}

	status.State = systemd.State(ctx, unitOf(ctx))
	status.Port = port(ctx)
	status.Unit = unitOf(ctx)
	status.Credentials = map[string]string{
		i18n.T("module.db.mysql.app_user.label"):    appPasswordKey,
		i18n.T("module.db.mysql.remote_user.label"): remotePasswordKey,
	}

	return status, nil
}

func URL(ctx *modules.Context, name string) (string, error) {
	if err := requireInstalled(ctx); err != nil {
		return "", err
	}

	return fmt.Sprintf("mysql://%s@%s:%d/%s", remoteAccount(ctx), loopback, port(ctx), database(name)), nil
}

func Shell(ctx *modules.Context, name string) (string, error) {
	if err := requireInstalled(ctx); err != nil {
		return "", err
	}

	return "sudo mysql " + database(name), nil
}

func Dump(ctx *modules.Context, name string) (string, int64, error) {
	if err := requireInstalled(ctx); err != nil {
		return "", 0, err
	}

	argv := []string{
		"mysqldump", "--protocol=socket", "--single-transaction", "--routines", "--events",
		"--default-character-set=utf8mb4", database(name),
	}

	return dumps.Write(ctx, database(name), ".sql", func(out io.Writer) error {
		_, err := sys.Exec(ctx, sys.Command{Argv: argv, Output: out})

		return err
	})
}

func Import(ctx *modules.Context, name string) ([]string, error) {
	if err := requireInstalled(ctx); err != nil {
		return nil, err
	}

	return importDumps(ctx, dumps.Options{Only: name, Force: name != ""})
}

func requireInstalled(ctx *modules.Context) error {
	if installedPackage(ctx) == "" {
		return modules.NotInstalled(ID, "MySQL")
	}

	return nil
}

func port(ctx *modules.Context) int {
	if chosen := ctx.Int("port"); chosen > 0 {
		return chosen
	}

	return DefaultPort
}

func appAccount(ctx *modules.Context) string {
	return accountOr(ctx, "app_user", defaultAppAccount)
}

func remoteAccount(ctx *modules.Context) string {
	return accountOr(ctx, "remote_user", defaultRemoteAccount)
}

// An account name reaches SQL as an identifier, hence the strict pattern.
func accountOr(ctx *modules.Context, key, fallback string) string {
	chosen := strings.TrimSpace(ctx.String(key))
	if chosen == "" || !accountPattern.MatchString(chosen) {
		return fallback
	}

	return chosen
}

// A pool above the machine's RAM gets the engine killed by the memory guard, which reads as a database that won't start.
func bufferPool(ctx *modules.Context) string {
	if chosen := strings.TrimSpace(ctx.String("buffer_pool")); chosen != "" {
		return chosen
	}

	mb := totalKB(ctx) / 1024 / poolDivisor

	switch {
	case mb < minPoolMB:
		mb = minPoolMB
	case mb > maxPoolMB:
		mb = maxPoolMB
	}

	return strconv.Itoa(mb) + "M"
}

func totalKB(ctx *modules.Context) int {
	if kb, known := host.MemTotalKB(ctx); known {
		return kb
	}

	return fallbackRAMKB
}

func database(name string) string {
	if name == "" {
		return defaultDatabase
	}

	return name
}

func installedPackage(ctx *modules.Context) string {
	for _, pkg := range []string{mysqlPackage, mariadbPackage} {
		if apt.Installed(ctx, pkg) {
			return pkg
		}
	}

	return ""
}

// The requested engine drives the installation; the one already there decides the configuration.
func engineOf(ctx *modules.Context) string {
	switch installedPackage(ctx) {
	case mariadbPackage:
		return mariadbEngine
	case mysqlPackage:
		return mysqlEngine
	}

	if ctx.String("engine") == mariadbEngine {
		return mariadbEngine
	}

	return mysqlEngine
}

func unitOf(ctx *modules.Context) string {
	if engineOf(ctx) == mariadbEngine {
		return mariadbUnit
	}

	return mysqlUnit
}

func packages(engine string) (chosen, fallback string) {
	if engine == mariadbEngine {
		return mariadbPackage, mysqlPackage
	}

	return mysqlPackage, mariadbPackage
}

func accountsExist(ctx *modules.Context) bool {
	query := fmt.Sprintf("SELECT COUNT(*) FROM mysql.user WHERE host = '%s' AND user IN ('%s', '%s')", loopback, appAccount(ctx), remoteAccount(ctx))

	out, err := sys.Exec(ctx, sys.Command{Argv: []string{"mysql", "--protocol=socket", "-N", "-B", "-e", query}})

	return err == nil && strings.TrimSpace(out.Stdout) == "2"
}

func renderConfig(engine string, port int, pool string) []byte {
	content := fmt.Sprintf(configTemplate, port, pool)
	if engine == mysqlEngine {
		content += mysqlxOff
	}

	return []byte(content)
}

// root@localhost stays on socket auth, which is what lets `sudo mysql`, db.shell and dump imports skip the password.
func renderAccounts(engine, appAccount, remoteAccount, app, remote string) string {
	identified := "IDENTIFIED WITH caching_sha2_password BY"

	// MariaDB has no IDENTIFIED WITH … BY; its IDENTIFIED BY is the native plugin the app account needs.
	if engine == mariadbEngine {
		identified = "IDENTIFIED BY"
	}

	return strings.Join([]string{
		"CREATE USER IF NOT EXISTS '" + appAccount + "'@'" + loopback + "' " + identified + " '" + quote(app) + "';",
		"ALTER USER '" + appAccount + "'@'" + loopback + "' " + identified + " '" + quote(app) + "';",
		"GRANT ALL PRIVILEGES ON *.* TO '" + appAccount + "'@'" + loopback + "' WITH GRANT OPTION;",
		"CREATE USER IF NOT EXISTS '" + remoteAccount + "'@'" + loopback + "' IDENTIFIED BY '" + quote(remote) + "';",
		"ALTER USER '" + remoteAccount + "'@'" + loopback + "' IDENTIFIED BY '" + quote(remote) + "';",
		"GRANT ALL PRIVILEGES ON *.* TO '" + remoteAccount + "'@'" + loopback + "' WITH GRANT OPTION;",
		"FLUSH PRIVILEGES;",
		"",
	}, "\n")
}

func quote(value string) string {
	return strings.NewReplacer(`\`, `\\`, `'`, `\'`).Replace(value)
}
