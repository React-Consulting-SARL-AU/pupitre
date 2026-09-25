package mongodb

import (
	"errors"
	"fmt"
	"io"
	"math"
	"regexp"
	"slices"
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
	"pupitre.studio/agent/internal/sys/host"
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

	defaultAppUser  = "app"
	authDatabase    = "admin"
	loopback        = "127.0.0.1"
	defaultDatabase = "admin"

	appPasswordKey = "MONGODB_APP_PASSWORD"

	userReady = "pupitre-user-ready"

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

// A list naming a release repo.mongodb.org does not serve answers 404 and breaks apt.
var published = map[string][]string{
	"8.0": {"jammy", "noble"},
	"7.0": {"jammy"},
}

// Removing the mongodb-org metapackage alone leaves the server installed.
var parts = []string{
	pkg,
	"mongodb-org-database",
	"mongodb-org-server",
	"mongodb-org-mongos",
	"mongodb-org-tools",
	"mongodb-org-database-tools-extra",
	"mongodb-org-shell",
	"mongodb-mongosh",
	"mongodb-database-tools",
}

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Preflight(ctx *modules.Context) []contract.FieldProblem {
	return modules.Problems(modules.PortTaken(ctx, "port"), unpublished(ctx), majorChanged(ctx))
}

func unpublished(ctx *modules.Context) *contract.FieldProblem {
	major, release := version(ctx), host.Codename(ctx)
	if slices.Contains(published[major], release) {
		return nil
	}

	return &contract.FieldProblem{
		Module:   ID,
		Field:    "version",
		Code:     contract.ProblemOptions,
		Expected: strings.Join(servedOn(release), ", "),
		Message:  unpublishedMessage(major, release),
	}
}

func unpublishedMessage(major, release string) string {
	served := servedOn(release)
	if len(served) == 0 {
		return i18n.T("field.mongodb.version.unsupported", release)
	}

	return i18n.T("field.mongodb.version.unpublished", major, release, strings.Join(served, ", "))
}

func servedOn(release string) []string {
	var served []string

	for _, field := range manifest().Fields {
		if field.Key != "version" {
			continue
		}

		for _, major := range field.Options {
			if slices.Contains(published[major], release) {
				served = append(served, major)
			}
		}
	}

	return served
}

// A new major refuses the old one's files until the client raises featureCompatibilityVersion by hand.
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

func (Module) Install(ctx *modules.Context) error {
	if err := ctx.Step("add-repository", func() (modules.Outcome, error) {
		if problem := unpublished(ctx); problem != nil {
			return modules.Failed, errors.New(problem.Message)
		}

		list := repository(version(ctx), host.Codename(ctx))
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

		return modules.Done, apt.RefreshAdded(ctx, listPath(ctx), keyringPath(ctx))
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

	// The user takes the new password before the env does, so a replay after a crash still signs in with the old one.
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

// The script goes on mongosh's stdin: an argv would show the password in ps.
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
			argv := append(credentials, "--archive")
			if dump.Gzip {
				argv = append(argv, "--gzip")
			}

			_, err := sys.Exec(ctx, sys.Command{Argv: append([]string{"mongorestore"}, argv...), StdinPath: dump.Path})

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
		installed := installedParts(ctx)
		if len(installed) == 0 {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Remove(ctx, installed...)
	}); err != nil {
		return err
	}

	if err := ctx.Step("remove-config", func() (modules.Outcome, error) {
		removed := false

		for _, path := range append([]string{confPath, markerPath}, repositoryFiles(ctx)...) {
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

func installedParts(ctx *modules.Context) []string {
	var installed []string

	for _, part := range parts {
		if apt.Installed(ctx, part) {
			installed = append(installed, part)
		}
	}

	return installed
}

// Every major's list and key: a list left behind is read at every later apt-get update.
func repositoryFiles(ctx *modules.Context) []string {
	var paths []string

	if entries, err := ctx.Sys().ReadDir(listDir); err == nil {
		for _, entry := range entries {
			if !entry.Dir && strings.HasPrefix(entry.Name, listPrefix) && strings.HasSuffix(entry.Name, ".list") {
				paths = append(paths, listDir+"/"+entry.Name)
			}
		}
	}

	for major := range published {
		paths = append(paths, keyringPathOf(major))
	}

	return paths
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

// mongosh prompts for the password itself, so a URL without one can be shown.
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

	return dumps.Write(ctx, database(name), ".archive.gz", func(out io.Writer) error {
		return withCredentials(ctx, func(credentials []string) error {
			argv := append(credentials, "--db="+database(name), "--archive", "--gzip")
			_, err := sys.Exec(ctx, sys.Command{Argv: append([]string{"mongodump"}, argv...), Output: out})

			return err
		})
	})
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

// A root-only --config file living for one command keeps the password out of an argv ps shows.
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

// The name reaches the mongosh script as an identifier, hence the strict pattern.
func appUser(ctx *modules.Context) string {
	chosen := strings.TrimSpace(ctx.String("app_user"))
	if chosen == "" || !userPattern.MatchString(chosen) {
		return defaultAppUser
	}

	return chosen
}

// Renaming the app user changes the marker, which makes the step run again.
func marker(ctx *modules.Context) []byte {
	return []byte(appUser(ctx) + "\n")
}

func renderConfig(port int, cacheGB string) []byte {
	return []byte(fmt.Sprintf(configTemplate, cacheGB, port))
}

// Left alone WiredTiger takes half the RAM, starving the projects that share the server.
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
	if kb, known := host.MemTotalKB(ctx); known {
		return kb
	}

	return fallbackRAMKB
}

// mongosh's REPL exits 0 on an uncaught error, so the script ends on a word the step reads back.
func renderUser(appUser, previous, password string) string {
	signIn := `try { admin.auth("` + appUser + `", password); } catch (error) {}`

	// A rotation signs in with the previous password; a replay whose rotation already went through falls back on the new.
	if previous != "" && previous != password {
		signIn = `try { admin.auth("` + appUser + `", ` + strconv.Quote(previous) + `); } catch (error) { ` + signIn + ` }`
	}

	return strings.Join([]string{
		`const admin = db.getSiblingDB("` + authDatabase + `");`,
		`const password = ` + strconv.Quote(password) + `;`,
		signIn,
		`let existing = null;`,
		// The localhost exception refuses usersInfo until the first user exists: a refused getUser means no user yet.
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

// mongod opens its port seconds after systemd says it started: a refused connection is retried up to startWait.
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
