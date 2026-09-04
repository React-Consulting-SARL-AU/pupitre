package mongodb

import (
	"fmt"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/db/dumps"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	Port    = 27017
	release = "8.0"

	pkg  = "mongodb-org"
	unit = "mongod"

	confPath   = "/etc/mongod.conf"
	markerPath = "/var/lib/pupitre/mongodb-app-user"
	markerDir  = "/var/lib/pupitre"

	keyringDir  = "/etc/apt/keyrings"
	keyringPath = keyringDir + "/mongodb-" + release + ".asc"
	keyURL      = "https://www.mongodb.org/static/pgp/server-" + release + ".asc"
	listPath    = "/etc/apt/sources.list.d/mongodb-org-" + release + ".list"

	osReleasePath   = "/etc/os-release"
	defaultCodename = "noble"

	appUser         = "app"
	authDatabase    = "admin"
	loopback        = "127.0.0.1"
	defaultDatabase = "admin"

	appPasswordKey = "MONGODB_APP_PASSWORD"
)

var config = []byte(`storage:
  dbPath: /var/lib/mongodb
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log
net:
  port: 27017
  bindIp: 127.0.0.1
security:
  authorization: enabled
`)

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
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
		list := repository(codename(ctx))
		if file.Exists(ctx, keyringPath) && file.Same(ctx, listPath, list) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(keyringDir, 0o755); err != nil {
			return modules.Failed, err
		}

		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"curl", "-fsSL", "-o", keyringPath, keyURL}}); err != nil {
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
		if apt.Installed(ctx, pkg) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Install(ctx, pkg)
	})
}

func (Module) Configure(ctx *modules.Context) error {
	changed, err := writeConfig(ctx)
	if err != nil {
		return err
	}

	if err := restart(ctx, changed); err != nil {
		return err
	}

	rotated, err := storePassword(ctx)
	if err != nil {
		return err
	}

	if err := createAppUser(ctx, rotated); err != nil {
		return err
	}

	_, err = importDumps(ctx, dumps.Options{})

	return err
}

func writeConfig(ctx *modules.Context) (bool, error) {
	changed := false

	err := ctx.Step("write-config", func() (modules.Outcome, error) {
		if file.Same(ctx, confPath, config) {
			return modules.Skipped, nil
		}

		changed = true

		return modules.Done, file.WriteAtomic(ctx, confPath, config, 0o644)
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

func storePassword(ctx *modules.Context) (bool, error) {
	rotated := false

	err := ctx.Step("store-password", func() (modules.Outcome, error) {
		stored, err := env.Set(ctx, appPasswordKey, ctx.Secret("app_password"))
		if err != nil {
			return modules.Failed, err
		}

		rotated = stored
		if !stored {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})

	return rotated, err
}

// The script goes in on the standard input of mongosh: an argv would show the password in ps.
func createAppUser(ctx *modules.Context, rotated bool) error {
	return ctx.Step("create-app-user", func() (modules.Outcome, error) {
		if !rotated && file.Exists(ctx, markerPath) {
			return modules.Skipped, nil
		}

		script := renderUser(ctx.Secret("app_password"))
		argv := []string{"mongosh", "--quiet", "--host", loopback, "--port", strconv.Itoa(Port)}
		if _, err := sys.Exec(ctx, sys.Command{Argv: argv, Stdin: []byte(script)}); err != nil {
			return modules.Failed, fmt.Errorf("création de l'utilisateur applicatif refusée : journalctl -u %s -n 40 · %w", unit, err)
		}

		if err := ctx.Sys().MkdirAll(markerDir, 0o755); err != nil {
			return modules.Failed, err
		}

		return modules.Done, file.WriteAtomic(ctx, markerPath, []byte(appUser+"\n"), 0o600)
	})
}

func importDumps(ctx *modules.Context, options dumps.Options) ([]string, error) {
	options.Patterns = []string{"*.archive", "*.archive.gz"}
	options.NativeGzip = true
	options.Load = func(dump dumps.File) error {
		argv := append(credentials(ctx), "--archive="+dump.Path)
		if dump.Gzip {
			argv = append(argv, "--gzip")
		}

		_, err := sys.Exec(ctx, sys.Command{Argv: append([]string{"mongorestore"}, argv...)})

		return err
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
	status.Port = Port
	status.Unit = unit
	status.Credentials = map[string]string{"Utilisateur applicatif": appPasswordKey}

	return status, nil
}

func URL(ctx *modules.Context, name string) (string, error) {
	if err := requireInstalled(ctx); err != nil {
		return "", err
	}

	return fmt.Sprintf("mongodb://%s@%s:%d/%s?authSource=%s", appUser, loopback, Port, database(name), authDatabase), nil
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

	path := fmt.Sprintf("%s/%s_%s.archive.gz", dumps.Dir, database(name), ctx.Now().Format("20060102-1504"))
	if err := ctx.Sys().MkdirAll(dumps.Dir, 0o755); err != nil {
		return "", 0, err
	}

	argv := append(credentials(ctx), "--db="+database(name), "--archive="+path, "--gzip")
	if _, err := sys.Exec(ctx, sys.Command{Argv: append([]string{"mongodump"}, argv...)}); err != nil {
		return "", 0, err
	}

	return path, size(ctx, path), nil
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

// mongodump and mongorestore read their credentials from the command line and from nowhere else; the journal masks them.
func credentials(ctx *modules.Context) []string {
	return []string{
		"--host=" + loopback, "--port=" + strconv.Itoa(Port),
		"--username=" + appUser, "--password=" + ctx.Secret("app_password"),
		"--authenticationDatabase=" + authDatabase,
	}
}

func size(ctx *modules.Context, path string) int64 {
	out, err := sys.Exec(ctx, sys.Command{Argv: []string{"stat", "-c", "%s", path}})
	if err != nil {
		return 0
	}

	bytes, err := strconv.ParseInt(strings.TrimSpace(out.Stdout), 10, 64)
	if err != nil {
		return 0
	}

	return bytes
}

func database(name string) string {
	if name == "" {
		return defaultDatabase
	}

	return name
}

func repository(codename string) []byte {
	return []byte("deb [ arch=amd64,arm64 signed-by=" + keyringPath + " ] https://repo.mongodb.org/apt/ubuntu " + codename + "/mongodb-org/" + release + " multiverse\n")
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

// The first user is created through the localhost exception; afterwards the script authenticates before touching anything.
func renderUser(password string) string {
	quoted := strconv.Quote(password)

	return strings.Join([]string{
		`const admin = db.getSiblingDB("` + authDatabase + `");`,
		`const password = ` + quoted + `;`,
		`try { admin.auth("` + appUser + `", password); } catch (error) {}`,
		`if (admin.getUser("` + appUser + `")) {`,
		`  admin.changeUserPassword("` + appUser + `", password);`,
		`} else {`,
		`  admin.createUser({ user: "` + appUser + `", pwd: password, roles: [{ role: "root", db: "` + authDatabase + `" }] });`,
		`}`,
		"",
	}, "\n")
}
