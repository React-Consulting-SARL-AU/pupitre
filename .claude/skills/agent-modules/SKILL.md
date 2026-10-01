---
name: agent-modules
description: "Write a `pupitred` Go module in `apps/agent/internal/modules/<category>/<name>` — `manifest.go`, `module.go`, `module_test.go`, `Module` interface, short named idempotent steps, `internal/sys` helpers, `step` events, `failed`/`warned` accounting and replay command, reading the closest neighbouring module before writing, unit test and staging test. Use whenever a catalogue module is added or modified."
---

# Agent modules

A catalogue service is a **module**: a Go unit that knows how to check itself, install, configure, update, uninstall and report its state, on Ubuntu 22.04 and 24.04, `amd64` and `arm64`. The app knows no module by name: it displays the manifests that `catalog` returns. A module added here appears in the app without rebuilding the app.

## Governed files

| File | Role |
| --- | --- |
| `apps/agent/internal/modules/<category>/<name>/manifest.go` | the manifest, conforming to `docs/contracts/service-catalog.md` |
| `apps/agent/internal/modules/<category>/<name>/module.go` | the `Module` implementation |
| `apps/agent/internal/modules/<category>/<name>/module_test.go` | the unit test on a fake system |
| `apps/agent/internal/modules/` | the `Module` interface, the `Context`, the registry, the engine, the journal |
| `apps/agent/internal/modules/modtest/` | `FakeSys`, `NewContext`, the demonstration modules `Passing` and `Failing` |
| `apps/agent/internal/sys/{apt,systemd,file,user,env,net}/` | the system helpers, all on `sys.Context`; `net` says what is already listening |
| `apps/agent/internal/sys/lock/` | the machine's file locks: installation, migration, keys, backups, update |
| `apps/agent/internal/contract/schema.json` | the JSON Schema exported from `packages/shared`; the Go types derive from it |
| `apps/agent/test/staging/<category>_test.go` | integration tests against the staging VPS |
| `apps/agent/package.json` | `build`, `build:dev`, `test`, `lint`, `lint:fix`, `check:types`; `test`, `lint` and `check:types` run a second time with `-tags dev` |
| `apps/agent/internal/modules/<category>/*/` | the delivered modules: the reference for what a module does and how to write it |
| `docs/contracts/service-catalog.md` | manifest, categories, fields, presets |
| `docs/contracts/agent-protocol.md` | `install`, `uninstall`, `upgrade`, `report`, `step` events, secret stream |
| `docs/contracts/config-migrations.md` | what it costs to rename a field already answered on a machine |

## State of the repository

The catalogue is complete: the thirty-eight modules of `docs/contracts/service-catalog.md` exist under `internal/modules/`, `internal/sys` carries the six helpers on `sys.Context` and the lock, `modtest` the fake system, and `test/staging/` the integration harness, behind the `staging` build tag. A new module is now added next to the others: read the closest neighbour before writing — a runtime per mise looks like `runtime/python`, a database like `db/postgres`, a tool that talks to an API like `tool/neon`.

What the customer chooses is part of the module: the **version** when several can be installed, the **port** when a service listens, the **account names** the module creates. Each field carries the `default` that reproduces the previous behaviour, and a name that goes through an SQL query or a configuration file is held to an identifier pattern, falling back to the default rather than an unrecognised value.

## Prohibitions

Taken from `apps/agent/CLAUDE.md` and `docs/security.md`. A PR that violates one of them is refused.

- **No script dropped on the customer's disk.** No `.sh`, no source file, no archive. A binary, `/etc/pupitre/` in 0600 root, generated systemd units, configuration files.
- **No `os/exec` with a built string.** Always an `argv`: `user.Run(ctx, "dev", "redis-cli", "ping")`. Never `sh -c` with a value coming from the protocol, a manifest or a file.
- **No secret logged.** Neither in `/var/log/pupitre.log`, nor in a `step` event, nor in the report, nor in an error. The journal replaces with `[secret]` any secret value known to the context; a secret is nonetheless never written in a message.
- **No inbound connection, no network call other than outbound HTTPS** to the platform or a package repository.
- **Nothing without a valid licence**: the engine refuses `install` with `license_required`; a module does not bypass this check.
- **The contract comes from `packages/shared`** through `internal/contract/schema.json`: a protocol or manifest type is not redeclared by hand.

## Anatomy of a module

```
internal/modules/db/redis/
├── manifest.go      the manifest and the identifier
├── module.go        the type, init() that registers it, the seven methods, the steps
└── module_test.go   idempotence, no secret, a failing step
```

The folder follows the manifest's category: `core/`, `runtime/`, `db/`, `ai/`, `editor/`, `exposure/`, `tool/`. The identifier is `<category>.<name>` (`db.redis`), the manifest's category is the contract's (`database`). `modules.Register(Module{})` in `init()` validates the manifest against the schema and refuses a duplicate.

### The interface

```go
type Module interface {
	Manifest() contract.Manifest
	Check(ctx *Context) (Status, error)
	Install(ctx *Context) error
	Configure(ctx *Context) error
	Upgrade(ctx *Context) error
	Uninstall(ctx *Context) error
	Status(ctx *Context) (Status, error)
}

type Status struct {
	Installed   bool
	Configured  bool
	Version     string
	Upgradable  bool
	State       contract.ServiceState
	Port        int
	Unit        string
	Credentials map[string]string
}
```

| Method | Does | Does not |
| --- | --- | --- |
| `Manifest` | returns the manifest, constant | read the system |
| `Check` | fills in `Installed`, `Version`, `Configured`, `Upgradable`; serves the probe, the replay and `upgrade` | modify anything |
| `Install` | packages, binaries, folders | the configuration that depends on the user's values |
| `Configure` | configuration files, accounts, secrets, systemd unit | reinstall |
| `Upgrade` | updates the package or the version, then replays `Configure` | change the chosen values |
| `Uninstall` | removes what the module installed: package, configuration, `/etc/pupitre/env` key | touch the data or what the customer installed themselves |
| `Status` | completes `Check` with `State`, `Port`, `Unit` and `Credentials`, whose values are **keys** of `/etc/pupitre/env`, never secrets | trigger an action |

`Status.Service(manifest)` converts a `modules.Status` into a `contract.ServiceStatus` for `service.status` and `snapshot`; a module does not build that type itself.

The engine resolves `requires` and `conflicts`, orders, chains `Install` then `Configure` for each requested module, and writes the report to `/var/lib/pupitre/report.json`. `upgrade` only touches the modules for which `Check` says `Installed`. A module never talks to another module: what it needs, it declares in `requires`.

### The steps

A method is a series of **short, named** steps. Each step checks before acting and returns `Skipped` if the work is already done; this is what makes `install` replayable in under 30 seconds on an installed machine.

```go
func (Module) Install(ctx *modules.Context) error {
	return ctx.Step("install-package", func() (modules.Outcome, error) {
		if apt.Installed(ctx, pkg) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Install(ctx, pkg)
	})
}
```

`ctx.Step` emits the protocol's `step` event with `status: "start"`, then `"ok"`, `"skip"` or `"fail"`, and the duration `ms`. A step that fails (`Failed`, an error, or a panic) stops **that module**, records it in `failed[]` with its replay command `sudo pupitred install --only=db.redis`, and returns a `*modules.StepError`; the following modules continue. The replay command comes from `modules.Replay(id)`; a gesture that is not replayed through `install` replaces it with `ctx.Replaying("…")`, like the backups (`sudo pupitred dev backup now`). A non-blocking problem is signalled with `ctx.Warn("…")`, which feeds `warned[]`, attaches as a message to the step in progress and sets the module to `warn`. The engine (`internal/modules/engine.go`) only runs `Configure` if `Install` did not fail, and writes everything to `/var/lib/pupitre/report.json`; `internal/modules/context.go` keeps the accounting.

Step names in kebab-case, a verb and an object: `install-package`, `write-config`, `create-app-user`, `enable-service`, `import-dumps`. A step that exceeds about twenty lines is split.

`ctx.Once("apt-update", fn)` only runs `fn` once per installation, all modules combined; `ctx.Logf` writes to the module's journal.

### Values and secrets

The manifest's fields arrive in the context: `ctx.Value("engine")`, `ctx.String`, `ctx.Int`, `ctx.Bool` for `text`, `number`, `select`, `version`, `boolean`, with the manifest's `default` when the app sent nothing; `ctx.Secret("password")` for `secret`.

A secret comes from the protocol's secret stream, never from `params`. `install`'s secret line has the shape of `config`, grouped by module identifier (`InstallSecrets` schema of `docs/contracts/agent-protocol.md`):

```json
{ "db.redis": { "password": "…" }, "db.postgres": { "app_password": "…" } }
```

The engine gives each module only its own entry; a malformed line is refused with `bad_request` before any installation. The engine keeps modules, `config` and secrets in `/etc/pupitre/install.json` (0600 root) so that `sudo pupitred install --only=<module>` replays with the same values; a module does not read this file.

A secret is written to `/etc/pupitre/env` through `env.Set(ctx, "REDIS_PASSWORD", value)`, which returns `(changed, err)` — `changed` is `false` if the value is already there, which gives the step's `Skipped` — and into the configuration file that needs it, in 0600 or 0640 root; it appears nowhere else. A `secret` field with `generate: true` arrives already generated by the app.

### The `internal/sys` helpers

All take `ctx` as first argument: a `sys.Context` (`Sys()`, `Logf`, `Once`), which `*modules.Context` satisfies. They log the command and the path, never a content.

| Package | Functions | What it guarantees |
| --- | --- | --- |
| `apt` | `Installed(ctx, pkg) bool`, `Missing(ctx, pkgs...) []string`, `Version(ctx, pkg) (string, error)`, `Update(ctx) error`, `Refresh(ctx) error`, `RefreshAdded(ctx, source, keyrings...) error`, `Install(ctx, pkgs...) error`, `Fix(ctx) error`, `Remove(ctx, pkgs...) error`, `Upgrade(ctx, pkg) (bool, error)` | `apt-get -o DPkg::Lock::Timeout=600 -o Dpkg::Use-Pty=0`, `DEBIAN_FRONTEND=noninteractive`, `-y -qq`; the lock timeout makes it wait up to ten minutes for `unattended-upgrades` to let go instead of failing; `Update` only runs once per installation, `Refresh` at every call (after adding a repository), and `RefreshAdded` removes the added repository if apt cannot read it; `Fix` replays `dpkg --configure -a` then `apt-get install -f`; `Upgrade` says whether a new version was installed |
| `systemd` | `Enable(ctx, unit)`, `Disable(ctx, unit)`, `Restart(ctx, unit)`, `Reload(ctx, unit)`, `Active(ctx, unit) bool`, `State(ctx, unit) contract.ServiceState`, `WriteUnit(ctx, name, content []byte) error` | `enable --now`, `daemon-reload` after `WriteUnit`, state read through `is-active` |
| `file` | `Read(ctx, path) ([]byte, error)`, `Exists(ctx, path) bool`, `Same(ctx, path, content []byte) bool`, `WriteAtomic(ctx, path, content []byte, mode) error`, `EnsureLine(ctx, path, line) (bool, error)`, `Chown(ctx, path, owner, group) error`, `Remove(ctx, path) (bool, error)` | write to a temporary file in the same folder then `rename`; `Same` compares the content to make the step idempotent; `EnsureLine` and `Remove` say whether they changed anything |
| `user` | `Home(name) string`, `Run(ctx, name, argv...) (string, error)`, `RunIn(ctx, name, dir, argv...)`, `RunWith(ctx, name, user.Input{Dir, Stdin, Env}, argv...)`, `Environment(name) []string`, `Exists(ctx, name) bool`, `Create(ctx, name, shell) error`, `Groups(ctx, name) ([]string, error)` | `Run` executes in the user's home folder, with the environment of `user.Environment` (`HOME`, `USER`, `LOGNAME`, `PATH` of `~/.local/bin`, the mise shims and `~/.bun/bin`, `MISE_YES=1`, `MISE_NPM_PACKAGE_MANAGER=npm`, `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`, and `SHELL=/usr/bin/zsh` outside root), `argv` only, returns the standard output; the command and its output are logged, secrets masked; what goes through `Input.Stdin` never reaches the journal |
| `env` | `Get(ctx, key) (string, bool, error)`, `Keys(ctx) ([]string, error)`, `Set(ctx, key, value) (bool, error)`, `Unset(ctx, key) (bool, error)` | `/etc/pupitre/env` in 0600 root, keys `^[A-Z][A-Z0-9_]*$`, values never logged; `Set` and `Unset` say whether the file changed |
| `net` | `Listening(ctx) Ports`, `Ports.Has(port) bool` | the listening TCP ports, read from `/proc/net/tcp` and `tcp6` rather than through `ss`: what a `Preflight` sets against an already taken port |
| `lock` | `Acquire(path) (release, held, error)`, `Hold(path, wait) (release, error)` | an exclusive `flock`; `Acquire` does not wait and says `held=false`, `Hold` waits until the deadline then returns `ErrHeld`. Takes no `sys.Context`: the engine, the migrations, the keys, the backups and the update hold it, never a module |

## Reading the delivered modules

The modules under `internal/modules/` are the reference: order of steps, apt pitfalls, files written and their paths, idempotence markers. Before writing, read the one that already does the closest thing:

| What is being written | Module to read |
| --- | --- |
| the machine's base: repaired dpkg, packages, swap, memory safeguard, system limits, time zone, `dev` user, `.zshrc` with the OSC 133 and OSC 7 markers, `dev` → `pupitred dev` link, the agent's units | `core/system` |
| what touches SSH or the firewall: ufw, fail2ban, `sshd` fragment validated by `sshd -t` before the reload, root closed **only if** `dev`'s `authorized_keys` is not empty, restricted sudo | `core/hardening` |
| a runtime installed through mise | `runtime/python`, `runtime/node`, with `runtime/mise` |
| a local database: `127.0.0.1` binding, accounts, chosen port, `Preflight` | `db/postgres`, `db/redis`; the dump import in `db/dumps` |
| a tool that talks to an API or keeps a token | `tool/neon`, `tool/github`; the projects' `.env.local` files in `tool/onepassword/env.go` |
| an exposure: tunnel, routes, DNS | `exposure/cloudflare`, `exposure/routes` |
| an AI agent and its skills | `ai/claude`, `ai/codex`, `ai/agents` (embedded skills, sub-agent and preferences) |

A module reads its values from the manifest and writes under `/etc/pupitre/` and `/var/lib/pupitre/`, nothing else.

## Complete example: `db.redis`

The delivered module lives in `internal/modules/db/redis` and carries four fields. What follows is a version reduced to a single one, to show the shape without drowning it: it installs Ubuntu's `redis-server`, writes a configuration included from `/etc/redis/redis.conf`, stores the password in `/etc/pupitre/env`, enables the unit.

`internal/modules/db/redis/manifest.go`:

```go
package redis

import "pupitre.studio/agent/internal/contract"

const ID = "db.redis"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "database",
		Name:      "Redis 7",
		Summary:   "Cache and queues, local only, with a password and persistence.",
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 128, DiskMB: 64},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "password", Kind: contract.FieldSecret, Label: "Password", Required: true, Generate: true},
		},
		Provides:  []string{"db:redis"},
		Mandatory: false,
		Since:     "0.2.0",
	}
}
```

`internal/modules/db/redis/module.go`:

```go
package redis

import (
	"fmt"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	pkg      = "redis-server"
	unit     = "redis-server"
	confPath = "/etc/redis/redis.conf"
	dropIn   = "/etc/redis/pupitre.conf"
	envKey   = "REDIS_PASSWORD"
	port     = 6379
)

const configTemplate = `bind 127.0.0.1 ::1
port %d
protected-mode yes
requirepass %s
appendonly yes
appendfsync everysec
maxmemory-policy noeviction
`

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

	return modules.Status{Installed: true, Version: version, Configured: file.Exists(ctx, dropIn)}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return ctx.Step("install-package", func() (modules.Outcome, error) {
		if apt.Installed(ctx, pkg) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Install(ctx, pkg)
	})
}

func (Module) Configure(ctx *modules.Context) error {
	content := renderConfig(ctx.Secret("password"))
	changed := false

	if err := ctx.Step("write-config", func() (modules.Outcome, error) {
		if file.Same(ctx, dropIn, content) {
			return modules.Skipped, nil
		}

		if err := file.WriteAtomic(ctx, dropIn, content, 0o640); err != nil {
			return modules.Failed, err
		}

		changed = true

		return modules.Done, file.Chown(ctx, dropIn, "root", "redis")
	}); err != nil {
		return err
	}

	if err := ctx.Step("include-config", func() (modules.Outcome, error) {
		added, err := file.EnsureLine(ctx, confPath, "include "+dropIn)
		if err != nil {
			return modules.Failed, err
		}

		if !added {
			return modules.Skipped, nil
		}

		changed = true

		return modules.Done, nil
	}); err != nil {
		return err
	}

	if err := ctx.Step("store-password", func() (modules.Outcome, error) {
		stored, err := env.Set(ctx, envKey, ctx.Secret("password"))
		if err != nil {
			return modules.Failed, err
		}

		if !stored {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	if err := ctx.Step("enable-service", func() (modules.Outcome, error) {
		if systemd.Active(ctx, unit) && !changed {
			return modules.Skipped, nil
		}

		if err := systemd.Enable(ctx, unit); err != nil {
			return modules.Failed, err
		}

		return modules.Done, systemd.Restart(ctx, unit)
	}); err != nil {
		return err
	}

	return ctx.Step("verify-auth", func() (modules.Outcome, error) {
		out, err := user.Run(ctx, "root", "redis-cli", "-a", ctx.Secret("password"), "--no-auth-warning", "ping")
		if err != nil || strings.TrimSpace(out) != "PONG" {
			return modules.Failed, fmt.Errorf("redis refuses the password: journalctl -u %s -n 40", unit)
		}

		return modules.Done, nil
	})
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
		removed, err := file.Remove(ctx, dropIn)
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

	return ctx.Step("forget-password", func() (modules.Outcome, error) {
		removed, err := env.Unset(ctx, envKey)
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
	status.Port = port
	status.Unit = unit
	status.Credentials = map[string]string{"Password": envKey}

	return status, nil
}

func renderConfig(password string) []byte {
	return []byte(fmt.Sprintf(configTemplate, port, password))
}
```

What the example shows: `verify-auth` passes the password as an argument to `redis-cli` through `argv`, and the journal replaces the value with `[secret]` in the command and its output; `store-password` relies on `env.Set`'s `changed` to be `skip` on replay; `Uninstall` does not touch `/var/lib/redis`, which belongs to the customer; `Status` cites the environment key, never the value, and the engine builds `service.status` through `status.Service(manifest)`.

`internal/modules/db/redis/module_test.go`:

```go
package redis

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
)

const password = "s3cret-for-tests"

func newContext(t *testing.T, sys *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, sys, modtest.Options{
		Manifest: manifest(),
		Secrets:  modtest.Secrets{"password": password},
	})
}

func TestInstallAndConfigureAreIdempotent(t *testing.T) {
	sys := modtest.NewFakeSys()
	sys.Packages[pkg] = "7.0.15"
	sys.Files[dropIn] = renderConfig(password)
	sys.Files[confPath] = []byte("include " + dropIn + "\n")
	sys.Files["/etc/pupitre/env"] = []byte(envKey + "=" + password + "\n")
	sys.Units[unit] = modtest.UnitActive
	sys.Replies["redis-cli"] = "PONG\n"
	ctx := newContext(t, sys)

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	for _, event := range ctx.Events() {
		if event.Step != "verify-auth" && event.Status != contract.StepSkip {
			t.Fatalf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}
	if sys.Restarts[unit] != 0 {
		t.Fatalf("redis restarted %d times on an installed machine", sys.Restarts[unit])
	}
}

func TestSecretNeverLeaks(t *testing.T) {
	sys := modtest.NewFakeSys()
	sys.Packages[pkg] = "7.0.15"
	sys.Replies["redis-cli"] = "PONG\n"
	ctx := newContext(t, sys)

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	for _, line := range ctx.Output() {
		if strings.Contains(line, password) {
			t.Fatalf("secret in output: %s", line)
		}
	}
	if !strings.Contains(string(sys.Files[dropIn]), "requirepass "+password) {
		t.Fatal("config must carry the password")
	}
	if sys.EnvValue(envKey) != password {
		t.Fatal("password must be stored in /etc/pupitre/env")
	}
}

func TestFailedStepReportsReplay(t *testing.T) {
	sys := modtest.NewFakeSys()
	sys.FailPackage(pkg, "E: Unable to locate package redis-server")
	ctx := newContext(t, sys)

	err := (Module{}).Install(ctx)
	if err == nil {
		t.Fatal("expected install to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only=db.redis" {
		t.Fatalf("unexpected event: %+v", last)
	}
}

var _ modules.Module = Module{}
```

`modtest.NewContext(t, sys, modtest.Options{…})` takes the manifest (`Manifest`, or `Module` for a simple identifier), the values (`Values`), the secrets (`Secrets`), an optional `Emit` and a `Now` clock; without `Now`, the clock advances 10 ms per read. `FakeSys` records the commands (`Calls`, `Commands()`), the files (`Files`, `Modes`, `Owners`), the packages (`Packages`, `Upgrades`, `FailPackage`), the units (`Units`, `Restarts`), the replies per program (`Replies`, `FailProgram`) and reads `/etc/pupitre/env` through `EnvValue`; it never touches the machine running `go test`. `ctx.Events()` returns the `ok`, `skip` and `fail` events (not the `start`s), `ctx.Output()` the journal lines, secrets already masked. Three tests minimum per module: idempotence on an installed machine, no secret in the output, a failing step with its replay command.

## Staging test

A module without a staging test is not finished (`apps/agent/CLAUDE.md`). Staging is a reinstallable VPS, never the owner's machine.

`apps/agent/test/staging/db_test.go`:

```go
//go:build staging

package staging

import (
	"strings"
	"testing"
)

func TestRedisListensLocallyWithPassword(t *testing.T) {
	host := stagingHost(t)
	install(t, host, "db.redis", secrets{"password": "s3cret-for-tests"})

	listening := ssh(t, host, "ss", "-ltn")
	if !strings.Contains(listening, "127.0.0.1:6379") || strings.Contains(listening, "0.0.0.0:6379") {
		t.Fatalf("redis must listen on 127.0.0.1 only:\n%s", listening)
	}

	if out := ssh(t, host, "redis-cli", "ping"); !strings.Contains(out, "NOAUTH") {
		t.Fatalf("redis must require a password, got %q", out)
	}

	report := lastReport(t, host)
	if strings.Contains(report, "s3cret-for-tests") {
		t.Fatal("password leaked into the report")
	}
}
```

- `stagingHost(t)` reads `PUPITRE_STAGING_HOST` (`root@203.0.113.10`) and calls `t.Skip` if it is absent, so that `go test ./...` stays green on a workstation without staging. The SSH key is that of the local SSH agent.
- The `staging` build tag separates these tests from the unit ones: `go test -tags staging ./test/staging/...`.
- Before a campaign: reinstall the VPS from a blank Ubuntu image at the host, push the freshly built binary to it, then `PUPITRE_STAGING_HOST=root@<address> go test -tags staging ./test/staging/...`. Without the variable, these tests skip.
- The `install`, `ssh`, `lastReport` helpers live in `test/staging/staging_test.go` and talk to staging through the same protocol as the app, secret line included.

## Before handing back

1. The manifest matches `docs/contracts/service-catalog.md` line by line: id, category, fields, `requires`, `conflicts`, `provides`.
2. Each step has a name, checks before acting, and `install` replayed on staging only emits `skip`s.
3. No `sh -c`, no script written to disk, no secret in `ctx.Output()`, the report or an error.
4. `Uninstall` only removes what the module installed.
5. Three unit tests on `modtest`, one staging test per expected behaviour.
6. `bun --cwd=apps/agent run lint` (`gofmt`, `go vet`, `staticcheck`, `govulncheck`), `bun --cwd=apps/agent run test` (`go test` with and without `-tags dev`) and `go test -tags staging ./test/staging/...` green.
7. The module follows the shape of its neighbours under `internal/modules/`: same helpers, same step names for the same gestures.
