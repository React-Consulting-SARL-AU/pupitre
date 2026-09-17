package mongodb

import (
	"errors"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

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

var (
	startWait = 30 * time.Second
	startPoll = 250 * time.Millisecond
)

const (
	DefaultPort    = 27017
	DefaultVersion = "8.0"

	pkg  = "mongodb-org"
	unit = "mongod"

	confPath   = "/etc/mongod.conf"
	markerPath = "/var/lib/pupitre/mongodb-app-user"
	markerDir  = "/var/lib/pupitre"

	toolsConfigDir  = "/etc/pupitre"
	toolsConfigPath = toolsConfigDir + "/mongodb-tools.yaml"

	keyringDir = "/etc/apt/keyrings"
	listDir    = "/etc/apt/sources.list.d"
	listPrefix = "mongodb-org-"

	osReleasePath   = "/etc/os-release"
	defaultCodename = "noble"

	defaultAppUser  = "app"
	authDatabase    = "admin"
	loopback        = "127.0.0.1"
	defaultDatabase = "admin"

	appPasswordKey = "MONGODB_APP_PASSWORD"

	userReady = "pupitre-user-ready"

	meminfoPath   = "/proc/meminfo"
	cacheDivisor  = 4
	minCacheMB    = 256
	maxCacheMB    = 8192
	fallbackRAMKB = 2 * 1024 * 1024
)

const configTemplate = `storage:
  dbPath: /var/lib/mongodb
  wiredTiger:
    engineConfig:
      cacheSizeGB: %s
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log
net:
  port: %d
  bindIp: 127.0.0.1
security:
  authorization: enabled
`

var (
	versionPattern = regexp.MustCompile(`^[0-9]{1,2}\.[0-9]$`)
	userPattern    = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)
)

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

// A port another program already holds, and a major the server does not run
// on, are what this configuration cannot know from the manifest alone.
func (Module) Preflight(ctx *modules.Context) []contract.FieldProblem {
	return modules.Problems(modules.PortTaken(ctx, "port"), majorChanged(ctx))
}

// A new major refuses the files of the old one until featureCompatibilityVersion
// was raised on the running server: that step is the client's, by hand, before
// the form says the new version.
func majorChanged(ctx *modules.Context) *contract.FieldProblem {
	held := strings.TrimSpace(fmt.Sprint(ctx.Held("version")))
	if ctx.Held("version") == nil || held == version(ctx) || !apt.Installed(ctx, pkg) {
		return nil
	}

	return &contract.FieldProblem{
		Module:  ID,
		Field:   "version",
		Code:    contract.ProblemOptions,
		Message: i18n.T("field.mongodb.version.held", held, version(ctx)),
	}
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !apt.Installed(ctx, pkg) {
		return modules.Status{}, nil
	}

	version, err := apt.Version(ctx, pkg)
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{Installed: true, Version: version, Configured: file.Exists(ctx, confPath)}, nil
}

// MongoDB is not in the Ubuntu archive: the module adds the project's own repository, key first.
func (Module) Install(ctx *modules.Context) error {
	if err := ctx.Step("add-repository", func() (modules.Outcome, error) {
		list := repository(version(ctx), codename(ctx))
		if file.Exists(ctx, keyringPath(ctx)) && file.Same(ctx, listPath(ctx), list) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(keyringDir, 0o755); err != nil {
			return modules.Failed, err
		}

		if err := apt.DownloadKey(ctx, keyURL(ctx), keyringPath(ctx)); err != nil {
			return modules.Failed, err
		}

		if err := file.WriteAtomic(ctx, listPath(ctx), list, 0o644); err != nil {
			return modules.Failed, err
		}

		if err := dropOtherLists(ctx); err != nil {
			return modules.Failed, err
		}

		return modules.Done, apt.Refresh(ctx)
	}); err != nil {
		return err
	}

	return ctx.Step("install-package", func() (modules.Outcome, error) {
		if apt.Installed(ctx, pkg) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Install(ctx, pkg)
	})
}

// The list of another major left beside the chosen one would take the next upgrade across it.
func dropOtherLists(ctx *modules.Context) error {
	entries, err := ctx.Sys().ReadDir(listDir)
	if err != nil {
		return nil
	}

	for _, entry := range entries {
		other, found := strings.CutPrefix(entry.Name, listPrefix)
		if entry.Dir || !found || !strings.HasSuffix(other, ".list") || listDir+"/"+entry.Name == listPath(ctx) {
			continue
		}

		if _, err := file.Remove(ctx, listDir+"/"+entry.Name); err != nil {
			return err
		}
	}

	return nil
}

func (Module) Configure(ctx *modules.Context) error {
	changed, err := writeConfig(ctx)
	if err != nil {
		return err
	}

	if err := restart(ctx, changed); err != nil {
		return err
	}

	// The user holds the new password before the env does: a replay after a
	// crash in between still signs in with the previous one and changes it again.
	previous, _, err := env.Get(ctx, appPasswordKey)
	if err != nil {
		return err
	}

	if err := createAppUser(ctx, previous); err != nil {
		return err
	}

	if err := storePassword(ctx); err != nil {
		return err
	}

	_, err = importDumps(ctx, dumps.Options{})

	return err
}

func writeConfig(ctx *modules.Context) (bool, error) {
	changed := false

	content := renderConfig(port(ctx), cacheSizeGB(ctx))

	err := ctx.Step("write-config", func() (modules.Outcome, error) {
		if file.Same(ctx, confPath, content) {
			return modules.Skipped, nil
		}

		changed = true

		return modules.Done, file.WriteAtomic(ctx, confPath, content, 0o644)
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

func storePassword(ctx *modules.Context) error {
	return ctx.Step("store-password", func() (modules.Outcome, error) {
		stored, err := env.Set(ctx, appPasswordKey, ctx.Secret("app_password"))
		if err != nil {
			return modules.Failed, err
		}

		if !stored {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

// The script goes in on the standard input of mongosh: an argv would show the password in ps.
func createAppUser(ctx *modules.Context, previous string) error {
	return ctx.Step("create-app-user", func() (modules.Outcome, error) {
		if previous == ctx.Secret("app_password") && file.Same(ctx, markerPath, marker(ctx)) {
			return modules.Skipped, nil
		}

		script := renderUser(appUser(ctx), previous, ctx.Secret("app_password"))
		argv := []string{"mongosh", "--quiet", "--host", loopback, "--port", strconv.Itoa(port(ctx))}
		out, err := untilConnected(func() (sys.Output, error) {
			return sys.Exec(ctx, sys.Command{Argv: argv, Stdin: []byte(script)})
		})
		if err != nil {
			return modules.Failed, errors.New(i18n.T("modules.mongodb.user_refused", unit, err.Error()))
		}

		if !strings.Contains(out.Stdout, userReady) {
			return modules.Failed, errors.New(i18n.T("modules.mongodb.user_refused", unit, lastLine(out.Stdout)))
		}

		if err := ctx.Sys().MkdirAll(markerDir, 0o755); err != nil {
			return modules.Failed, err
		}

		return modules.Done, file.WriteAtomic(ctx, markerPath, marker(ctx), 0o600)
	})
}

func importDumps(ctx *modules.Context, options dumps.Options) ([]string, error) {
	options.Patterns = []string{"*.archive", "*.archive.gz"}
	options.NativeGzip = true
	options.Load = func(dump dumps.File) error {
		return withCredentials(ctx, func(credentials []string) error {
			argv := append(credentials, "--archive="+dump.Path)
			if dump.Gzip {
				argv = append(argv, "--gzip")
			}

			_, err := sys.Exec(ctx, sys.Command{Argv: append([]string{"mongorestore"}, argv...)})

			return err
		})
	}

	return dumps.Import(ctx, options)
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-package", func() (modules.Outcome, error) {
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

// The data in /var/lib/mongodb and the dumps belong to the client.
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
		if !apt.Installed(ctx, pkg) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Remove(ctx, pkg)
	}); err != nil {
		return err
	}

	if err := ctx.Step("remove-config", func() (modules.Outcome, error) {
		removed := false
		for _, path := range []string{confPath, markerPath} {
			gone, err := file.Remove(ctx, path)
			if err != nil {
				return modules.Failed, err
			}

			removed = removed || gone
		}

		if !removed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return ctx.Step("forget-password", func() (modules.Outcome, error) {
		removed, err := env.Unset(ctx, appPasswordKey)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
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
	status.Credentials = map[string]string{i18n.T("module.db.mongodb.app_user.label"): appPasswordKey}

	return status, nil
}

func URL(ctx *modules.Context, name string) (string, error) {
	if err := requireInstalled(ctx); err != nil {
		return "", err
	}

	return fmt.Sprintf("mongodb://%s@%s:%d/%s?authSource=%s", appUser(ctx), loopback, port(ctx), database(name), authDatabase), nil
}

// mongosh asks for the password itself: an url without one is an url that can be shown.
func Shell(ctx *modules.Context, name string) (string, error) {
	url, err := URL(ctx, name)
	if err != nil {
		return "", err
	}

	return "mongosh " + url, nil
}

func Dump(ctx *modules.Context, name string) (string, int64, error) {
	if err := requireInstalled(ctx); err != nil {
		return "", 0, err
	}

	path, err := dumps.Target(ctx, database(name), ".archive.gz")
	if err != nil {
		return "", 0, err
	}

	err = withCredentials(ctx, func(credentials []string) error {
		argv := append(credentials, "--db="+database(name), "--archive="+path, "--gzip")
		_, err := sys.Exec(ctx, sys.Command{Argv: append([]string{"mongodump"}, argv...)})

		return err
	})
	if err != nil {
		return "", 0, err
	}

	size, err := dumps.Written(ctx, path)

	return path, size, err
}

func Import(ctx *modules.Context, name string) ([]string, error) {
	if err := requireInstalled(ctx); err != nil {
		return nil, err
	}

	return importDumps(ctx, dumps.Options{Only: name, Force: name != ""})
}

func requireInstalled(ctx *modules.Context) error {
	if !apt.Installed(ctx, pkg) {
		return modules.NotInstalled(ID, "MongoDB")
	}

	return nil
}

// The password reaches mongodump and mongorestore through the --config file they accept for it, never through an argv ps shows; the file is root's alone and lives for one command.
func withCredentials(ctx *modules.Context, run func(credentials []string) error) error {
	if err := ctx.Sys().MkdirAll(toolsConfigDir, 0o700); err != nil {
		return err
	}

	if err := file.WriteAtomic(ctx, toolsConfigPath, []byte("password: "+strconv.Quote(ctx.Secret("app_password"))+"\n"), 0o600); err != nil {
		return err
	}
	defer file.Remove(ctx, toolsConfigPath)

	return run([]string{
		"--config=" + toolsConfigPath,
		"--host=" + loopback, "--port=" + strconv.Itoa(port(ctx)),
		"--username=" + appUser(ctx), "--authenticationDatabase=" + authDatabase,
	})
}

func database(name string) string {
	if name == "" {
		return defaultDatabase
	}

	return name
}

func repository(version, codename string) []byte {
	return []byte("deb [ arch=amd64,arm64 signed-by=" + keyringPathOf(version) + " ] https://repo.mongodb.org/apt/ubuntu " + codename + "/mongodb-org/" + version + " multiverse\n")
}

func version(ctx *modules.Context) string {
	chosen := strings.TrimSpace(ctx.String("version"))
	if chosen == "" || !versionPattern.MatchString(chosen) {
		return DefaultVersion
	}

	return chosen
}

func keyringPathOf(version string) string {
	return keyringDir + "/mongodb-" + version + ".asc"
}

func keyringPath(ctx *modules.Context) string {
	return keyringPathOf(version(ctx))
}

func keyURL(ctx *modules.Context) string {
	return "https://www.mongodb.org/static/pgp/server-" + version(ctx) + ".asc"
}

func listPath(ctx *modules.Context) string {
	return listDir + "/" + listPrefix + version(ctx) + ".list"
}

func port(ctx *modules.Context) int {
	if chosen := ctx.Int("port"); chosen > 0 {
		return chosen
	}

	return DefaultPort
}

// A user name reaches the mongosh script as an identifier, so it is held to what Mongo accepts and nothing else.
func appUser(ctx *modules.Context) string {
	chosen := strings.TrimSpace(ctx.String("app_user"))
	if chosen == "" || !userPattern.MatchString(chosen) {
		return defaultAppUser
	}

	return chosen
}

// The marker carries the user it created: renaming the applicative user is what makes the step run again.
func marker(ctx *modules.Context) []byte {
	return []byte(appUser(ctx) + "\n")
}

func renderConfig(port int, cacheGB string) []byte {
	return []byte(fmt.Sprintf(configTemplate, cacheGB, port))
}

// WiredTiger left alone takes half of what the machine has: on a server that also runs projects, that is the memory guard waiting to happen.
func cacheSizeGB(ctx *modules.Context) string {
	mb := ctx.Int("cache_mb")
	if mb <= 0 {
		mb = totalKB(ctx) / 1024 / cacheDivisor
	}

	switch {
	case mb < minCacheMB:
		mb = minCacheMB
	case mb > maxCacheMB:
		mb = maxCacheMB
	}

	return strconv.FormatFloat(math.Round(float64(mb)/1024*100)/100, 'f', -1, 64)
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

// The first user is created through the localhost exception; afterwards only
// the password the user holds opens the server, so a rotation signs in with the
// previous one, and a replay whose previous one already went through falls back
// on the new one.
// The script runs on mongosh's REPL, where an uncaught error prints and the
// shell still exits 0: it ends on a word of its own that the step reads back.
// Before the first user exists, the localhost exception lets createUser through
// and refuses usersInfo, so a refused getUser reads as no user yet.
func renderUser(appUser, previous, password string) string {
	signIn := `try { admin.auth("` + appUser + `", password); } catch (error) {}`
	if previous != "" && previous != password {
		signIn = `try { admin.auth("` + appUser + `", ` + strconv.Quote(previous) + `); } catch (error) { ` + signIn + ` }`
	}

	return strings.Join([]string{
		`const admin = db.getSiblingDB("` + authDatabase + `");`,
		`const password = ` + strconv.Quote(password) + `;`,
		signIn,
		`let existing = null;`,
		`try { existing = admin.getUser("` + appUser + `"); } catch (error) { existing = null; }`,
		`if (existing) {`,
		`  admin.changeUserPassword("` + appUser + `", password);`,
		`} else {`,
		`  admin.createUser({ user: "` + appUser + `", pwd: password, roles: [{ role: "root", db: "` + authDatabase + `" }] });`,
		`}`,
		`print("` + userReady + `");`,
		"",
	}, "\n")
}

// mongod opens its port a few seconds after systemd reports it started: a shell refused on the door is asked again, up to the wait.
func untilConnected(run func() (sys.Output, error)) (sys.Output, error) {
	deadline := time.Now().Add(startWait)
	for {
		out, err := run()
		if err == nil || !strings.Contains(err.Error(), "ECONNREFUSED") || !time.Now().Before(deadline) {
			return out, err
		}

		time.Sleep(startPoll)
	}
}

func lastLine(out string) string {
	lines := strings.Split(strings.TrimSpace(out), "\n")

	return strings.TrimSpace(lines[len(lines)-1])
}
