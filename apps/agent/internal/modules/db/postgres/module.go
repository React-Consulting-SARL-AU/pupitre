package postgres

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
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	DefaultPort    = 5432
	DefaultVersion = "17"

	unit     = "postgresql"
	dataHome = "/var/lib/postgresql"

	keyringDir  = "/etc/apt/keyrings"
	keyringPath = keyringDir + "/pgdg.asc"
	keyURL      = "https://www.postgresql.org/media/keys/ACCC4CF8.asc"
	listPath    = "/etc/apt/sources.list.d/pgdg.list"

	osReleasePath   = "/etc/os-release"
	defaultCodename = "noble"

	defaultAppRole    = "app"
	defaultRemoteRole = "dev"

	loopback        = "127.0.0.1"
	defaultDatabase = "postgres"

	appPasswordKey    = "POSTGRES_APP_PASSWORD"
	remotePasswordKey = "POSTGRES_REMOTE_PASSWORD"

	hbaLine = "host    all             all             127.0.0.1/32            scram-sha-256"

	countExtensions = "SELECT count(*) FROM pg_extension WHERE extname IN ('pg_trgm', 'uuid-ossp', 'citext')"

	meminfoPath   = "/proc/meminfo"
	bufferDivisor = 4
	minBufferMB   = 128
	maxBufferMB   = 8192
	fallbackRAMKB = 2 * 1024 * 1024
)

var extensions = []string{"pg_trgm", "uuid-ossp", "citext"}

var (
	versionPattern = regexp.MustCompile(`^[0-9]{1,2}$`)
	rolePattern    = regexp.MustCompile(`^[a-z][a-z0-9_]{0,62}$`)
)

const configTemplate = `listen_addresses = '127.0.0.1'
port = %d
shared_buffers = %s
password_encryption = scram-sha-256
`

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

// A port another program already holds, and a major the cluster does not run
// on, are what this configuration cannot know from the manifest alone.
func (Module) Preflight(ctx *modules.Context) []contract.FieldProblem {
	return modules.Problems(modules.PortTaken(ctx, "port"), majorChanged(ctx))
}

// A second major installed beside the first is a second cluster on the same
// port, with the data left on the old one: moving them is pg_upgradecluster's
// job, by hand, before the form says the new version.
func majorChanged(ctx *modules.Context) *contract.FieldProblem {
	held := strings.TrimSpace(fmt.Sprint(ctx.Held("version")))
	if ctx.Held("version") == nil || held == version(ctx) || !apt.Installed(ctx, "postgresql-"+held) {
		return nil
	}

	return &contract.FieldProblem{
		Module:  ID,
		Field:   "version",
		Code:    contract.ProblemOptions,
		Message: i18n.T("field.postgres.version.held", held, version(ctx)),
	}
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !apt.Installed(ctx, pkg(ctx)) {
		return modules.Status{}, nil
	}

	release, err := apt.Version(ctx, pkg(ctx))
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{Installed: true, Version: release, Configured: file.Exists(ctx, confPath(ctx))}, nil
}

// The version the client asked for is rarely the one Ubuntu ships: the module adds the project's own repository, key first.
func (Module) Install(ctx *modules.Context) error {
	if err := ctx.Step("add-repository", func() (modules.Outcome, error) {
		list := repository(codename(ctx))
		if file.Exists(ctx, keyringPath) && file.Same(ctx, listPath, list) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(keyringDir, 0o755); err != nil {
			return modules.Failed, err
		}

		if err := apt.DownloadKey(ctx, keyURL, keyringPath); err != nil {
			return modules.Failed, err
		}

		if err := file.WriteAtomic(ctx, listPath, list, 0o644); err != nil {
			return modules.Failed, err
		}

		return modules.Done, apt.Refresh(ctx)
	}); err != nil {
		return err
	}

	return ctx.Step("install-package", func() (modules.Outcome, error) {
		if apt.Installed(ctx, pkg(ctx)) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Install(ctx, pkg(ctx))
	})
}

func (Module) Configure(ctx *modules.Context) error {
	changed, err := writeConfig(ctx)
	if err != nil {
		return err
	}

	allowed, err := allowLoopback(ctx)
	if err != nil {
		return err
	}

	if err := restart(ctx, changed || allowed); err != nil {
		return err
	}

	// The roles hold the new passwords before the env does: a replay after a
	// crash in between finds them rotated and alters the roles again.
	if err := createRoles(ctx, passwordsChanged(ctx)); err != nil {
		return err
	}

	if err := storePasswords(ctx); err != nil {
		return err
	}

	if err := installExtensions(ctx); err != nil {
		return err
	}

	_, err = importDumps(ctx, dumps.Options{})

	return err
}

func writeConfig(ctx *modules.Context) (bool, error) {
	content := renderConfig(port(ctx), sharedBuffers(ctx))
	changed := false

	err := ctx.Step("write-config", func() (modules.Outcome, error) {
		if file.Same(ctx, confPath(ctx), content) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(clusterDir(ctx)+"/conf.d", 0o755); err != nil {
			return modules.Failed, err
		}

		changed = true

		return modules.Done, file.WriteAtomic(ctx, confPath(ctx), content, 0o644)
	})

	return changed, err
}

func allowLoopback(ctx *modules.Context) (bool, error) {
	changed := false

	err := ctx.Step("allow-loopback", func() (modules.Outcome, error) {
		if !file.Exists(ctx, hbaPath(ctx)) {
			ctx.Warn(i18n.T("warn.postgres.hba.missing", hbaPath(ctx)))

			return modules.Skipped, nil
		}

		added, err := file.EnsureLine(ctx, hbaPath(ctx), hbaLine)
		if err != nil {
			return modules.Failed, err
		}

		if !added {
			return modules.Skipped, nil
		}

		changed = true

		return modules.Done, nil
	})

	return changed, err
}

func restart(ctx *modules.Context, changed bool) error {
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

// The passwords travel on the standard input of psql: an argv would show them in ps.
func createRoles(ctx *modules.Context, rotated bool) error {
	return ctx.Step("create-roles", func() (modules.Outcome, error) {
		if !rotated && rolesExist(ctx) {
			return modules.Skipped, nil
		}

		sql := renderRoles(appRole(ctx), remoteRole(ctx), ctx.Secret("app_password"), ctx.Secret("remote_password"))
		if _, err := psql(ctx, []string{"psql", "-v", "ON_ERROR_STOP=1", "--quiet", "--no-psqlrc"}, sql); err != nil {
			return modules.Failed, errors.New(i18n.T("modules.postgres.roles_refused", unit, err.Error()))
		}

		return modules.Done, nil
	})
}

// template1 is the model of every database created afterwards, dumps included.
func installExtensions(ctx *modules.Context) error {
	return ctx.Step("install-extensions", func() (modules.Outcome, error) {
		if count(ctx, "template1", countExtensions) == strconv.Itoa(len(extensions)) {
			return modules.Skipped, nil
		}

		for _, extension := range extensions {
			statement := `CREATE EXTENSION IF NOT EXISTS "` + extension + `"`
			if _, err := psql(ctx, []string{"psql", "--dbname=template1", "-c", statement}, ""); err != nil {
				return modules.Failed, err
			}
		}

		return modules.Done, nil
	})
}

// ~dev is closed to the postgres account, so the dump goes in on a standard input root opened, exactly as mysql reads its own.
func importDumps(ctx *modules.Context, options dumps.Options) ([]string, error) {
	options.Patterns = []string{"*.sql", "*.sql.gz", "*.dump"}
	options.Load = func(dump dumps.File) error {
		if err := createDatabase(ctx, dump.Database); err != nil {
			return err
		}

		argv := []string{"psql", "-v", "ON_ERROR_STOP=1", "--dbname=" + dump.Database}
		if strings.HasSuffix(dump.Path, ".dump") {
			argv = []string{"pg_restore", "--no-owner", "--dbname=" + dump.Database}
		}

		_, err := sys.Exec(ctx, sys.Command{User: "postgres", Dir: dataHome, Argv: argv, StdinPath: dump.Path})

		return err
	}

	return dumps.Import(ctx, options)
}

func createDatabase(ctx *modules.Context, name string) error {
	if count(ctx, defaultDatabase, "SELECT 1 FROM pg_database WHERE datname = '"+name+"'") == "1" {
		return nil
	}

	_, err := psql(ctx, []string{"createdb", "--owner=" + appRole(ctx), name}, "")

	return err
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-package", func() (modules.Outcome, error) {
		upgraded, err := apt.Upgrade(ctx, pkg(ctx))
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

// The cluster in /var/lib/postgresql and the dumps belong to the client.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := ctx.Step("stop-service", func() (modules.Outcome, error) {
		if !systemd.Active(ctx, unit) {
			return modules.Skipped, nil
		}

		return modules.Done, systemd.Disable(ctx, unit)
	}); err != nil {
		return err
	}

	if err := ctx.Step("remove-package", func() (modules.Outcome, error) {
		if !apt.Installed(ctx, pkg(ctx)) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Remove(ctx, pkg(ctx))
	}); err != nil {
		return err
	}

	if err := ctx.Step("remove-config", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, confPath(ctx))
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

	status.State = systemd.State(ctx, unit)
	status.Port = port(ctx)
	status.Unit = unit
	status.Credentials = map[string]string{
		i18n.T("module.db.postgres.app_role.label"):    appPasswordKey,
		i18n.T("module.db.postgres.remote_role.label"): remotePasswordKey,
	}

	return status, nil
}

func URL(ctx *modules.Context, name string) (string, error) {
	if err := requireInstalled(ctx); err != nil {
		return "", err
	}

	return fmt.Sprintf("postgresql://%s@%s:%d/%s", remoteRole(ctx), loopback, port(ctx), database(name)), nil
}

func Shell(ctx *modules.Context, name string) (string, error) {
	if err := requireInstalled(ctx); err != nil {
		return "", err
	}

	return "sudo -u postgres psql " + database(name), nil
}

// pg_dump writes as root into ~/dumps, so it connects on the loopback as the application role rather than on the socket as postgres.
func Dump(ctx *modules.Context, name string) (string, int64, error) {
	if err := requireInstalled(ctx); err != nil {
		return "", 0, err
	}

	argv := []string{
		"pg_dump", "--format=custom", "--host=" + loopback, "--port=" + strconv.Itoa(port(ctx)),
		"--username=" + appRole(ctx), "--no-password", database(name),
	}

	return dumps.Write(ctx, database(name), ".dump", func(out io.Writer) error {
		_, err := sys.Exec(ctx, sys.Command{Argv: argv, Env: []string{"PGPASSWORD=" + ctx.Secret("app_password")}, Output: out})

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
	if !apt.Installed(ctx, pkg(ctx)) {
		return modules.NotInstalled(ID, "PostgreSQL")
	}

	return nil
}

func psql(ctx *modules.Context, argv []string, stdin string) (string, error) {
	out, err := sys.Exec(ctx, sys.Command{User: "postgres", Dir: dataHome, Argv: argv, Stdin: []byte(stdin)})

	return out.Stdout, err
}

func count(ctx *modules.Context, database, query string) string {
	out, err := psql(ctx, []string{"psql", "--dbname=" + database, "-tAc", query}, "")
	if err != nil {
		return ""
	}

	return strings.TrimSpace(out)
}

func rolesExist(ctx *modules.Context) bool {
	query := fmt.Sprintf("SELECT count(*) FROM pg_roles WHERE rolname IN ('%s', '%s')", appRole(ctx), remoteRole(ctx))

	return count(ctx, defaultDatabase, query) == "2"
}

func version(ctx *modules.Context) string {
	chosen := strings.TrimSpace(ctx.String("version"))
	if chosen == "" || !versionPattern.MatchString(chosen) {
		return DefaultVersion
	}

	return chosen
}

func pkg(ctx *modules.Context) string {
	return "postgresql-" + version(ctx)
}

func clusterDir(ctx *modules.Context) string {
	return "/etc/postgresql/" + version(ctx) + "/main"
}

func confPath(ctx *modules.Context) string {
	return clusterDir(ctx) + "/conf.d/99-pupitre.conf"
}

func hbaPath(ctx *modules.Context) string {
	return clusterDir(ctx) + "/pg_hba.conf"
}

func port(ctx *modules.Context) int {
	if chosen := ctx.Int("port"); chosen > 0 {
		return chosen
	}

	return DefaultPort
}

func appRole(ctx *modules.Context) string {
	return roleOr(ctx, "app_role", defaultAppRole)
}

func remoteRole(ctx *modules.Context) string {
	return roleOr(ctx, "remote_role", defaultRemoteRole)
}

// A role name reaches SQL as an identifier, so it is held to what PostgreSQL accepts and nothing else.
func roleOr(ctx *modules.Context, key, fallback string) string {
	chosen := strings.TrimSpace(ctx.String(key))
	if chosen == "" || !rolePattern.MatchString(chosen) {
		return fallback
	}

	return chosen
}

func database(name string) string {
	if name == "" {
		return defaultDatabase
	}

	return name
}

func repository(release string) []byte {
	return []byte("deb [signed-by=" + keyringPath + "] https://apt.postgresql.org/pub/repos/apt " + release + "-pgdg main\n")
}

func codename(ctx *modules.Context) string {
	raw, err := file.Read(ctx, osReleasePath)
	if err != nil {
		return defaultCodename
	}

	for _, line := range strings.Split(string(raw), "\n") {
		if value, ok := strings.CutPrefix(line, "VERSION_CODENAME="); ok {
			return strings.Trim(value, `"`)
		}
	}

	return defaultCodename
}

func renderConfig(port int, buffers string) []byte {
	return []byte(fmt.Sprintf(configTemplate, port, buffers))
}

func renderRoles(appRole, remoteRole, app, remote string) string {
	return strings.Join([]string{
		"DO $do$",
		"BEGIN",
		`  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '` + appRole + `') THEN CREATE ROLE "` + appRole + `" LOGIN CREATEDB; END IF;`,
		`  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '` + remoteRole + `') THEN CREATE ROLE "` + remoteRole + `" LOGIN CREATEDB; END IF;`,
		"END",
		"$do$;",
		`ALTER ROLE "` + appRole + `" WITH LOGIN CREATEDB PASSWORD '` + quote(app) + `';`,
		`ALTER ROLE "` + remoteRole + `" WITH LOGIN CREATEDB PASSWORD '` + quote(remote) + `';`,
		"",
	}, "\n")
}

func quote(value string) string {
	return strings.ReplaceAll(value, "'", "''")
}

// Buffers sized above the machine get the cluster killed by the memory guard, which reads as a database that will not start.
func sharedBuffers(ctx *modules.Context) string {
	if chosen := strings.TrimSpace(ctx.String("shared_buffers")); chosen != "" {
		return chosen
	}

	mb := totalKB(ctx) / 1024 / bufferDivisor

	switch {
	case mb < minBufferMB:
		mb = minBufferMB
	case mb > maxBufferMB:
		mb = maxBufferMB
	}

	return strconv.Itoa(mb) + "MB"
}

func totalKB(ctx *modules.Context) int {
	raw, err := file.Read(ctx, meminfoPath)
	if err != nil {
		return fallbackRAMKB
	}

	for _, line := range strings.Split(string(raw), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 || fields[0] != "MemTotal:" {
			continue
		}

		if kb, err := strconv.Atoi(fields[1]); err == nil {
			return kb
		}
	}

	return fallbackRAMKB
}
