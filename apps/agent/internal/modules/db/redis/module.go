package redis

import (
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	DefaultPort = 6379

	// What Redis evicts once the cap is reached; without a cap it evicts nothing, whatever the policy says.
	DefaultPolicy = "allkeys-lru"
	noEviction    = "noeviction"

	pkg      = "redis-server"
	unit     = "redis-server"
	confPath = "/etc/redis/redis.conf"
	dropIn   = "/etc/redis/pupitre.conf"

	passwordKey = "REDIS_PASSWORD"
)

var policies = []string{DefaultPolicy, "allkeys-lfu", "allkeys-random", "volatile-lru", "volatile-lfu", "volatile-ttl", noEviction}

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

// A port another program already holds is the one thing this configuration cannot know from the manifest alone.
func (Module) Preflight(ctx *modules.Context) []contract.FieldProblem {
	return modules.Problems(modules.PortTaken(ctx, "port"))
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

func (m Module) Configure(ctx *modules.Context) error {
	running := runningConfig(ctx)

	changed, err := writeConfig(ctx)
	if err != nil {
		return err
	}

	included, err := includeConfig(ctx)
	if err != nil {
		return err
	}

	if err := storePassword(ctx); err != nil {
		return err
	}

	applied, err := applyLive(ctx, running, changed && !included)
	if err != nil {
		return err
	}

	if err := restart(ctx, (changed || included) && !applied); err != nil {
		return err
	}

	return verify(ctx)
}

// What the server is running on right now: the port of the drop-in it started with, and the password the machine held for it.
type live struct {
	port     int
	password string
	known    bool
}

func runningConfig(ctx *modules.Context) live {
	previous, err := file.Read(ctx, dropIn)
	if err != nil || !systemd.Active(ctx, unit) {
		return live{}
	}

	password, held, err := env.Get(ctx, passwordKey)
	if err != nil || !held {
		return live{}
	}

	return live{port: portOf(previous), password: password, known: true}
}

func portOf(config []byte) int {
	for _, line := range strings.Split(string(config), "\n") {
		if value, found := strings.CutPrefix(line, "port "); found {
			if parsed, err := strconv.Atoi(strings.TrimSpace(value)); err == nil {
				return parsed
			}
		}
	}

	return 0
}

// Everything the drop-in says but the port takes effect on the running server through CONFIG SET, so a new
// password or a new memory cap costs no restart — and a cache without persistence keeps what it holds.
// The commands go in on the standard input, the old password through REDISCLI_AUTH: neither reaches an argv ps shows.
func applyLive(ctx *modules.Context, running live, wanted bool) (bool, error) {
	applied := false

	err := ctx.Step("apply-config", func() (modules.Outcome, error) {
		if !wanted || !running.known || running.port != port(ctx) {
			return modules.Skipped, nil
		}

		input := user.Input{
			Env:   []string{"REDISCLI_AUTH=" + running.password},
			Stdin: []byte(renderLive(ctx.Secret("password"), ctx.Bool("persistence"), ctx.Int("maxmemory_mb"), policy(ctx))),
		}
		out, err := user.RunWith(ctx, "root", input, "redis-cli", "-p", strconv.Itoa(running.port), "--no-auth-warning")
		if err != nil || strings.Contains(out, "ERR") {
			ctx.Logf("%s did not take the new settings live, restarting it instead", unit)

			return modules.Skipped, nil
		}

		applied = true

		return modules.Done, nil
	})

	return applied, err
}

func writeConfig(ctx *modules.Context) (bool, error) {
	content := renderConfig(port(ctx), ctx.Secret("password"), ctx.Bool("persistence"), ctx.Int("maxmemory_mb"), policy(ctx))
	changed := false

	err := ctx.Step("write-config", func() (modules.Outcome, error) {
		if file.Same(ctx, dropIn, content) {
			return modules.Skipped, nil
		}

		if err := file.WriteAtomic(ctx, dropIn, content, 0o640); err != nil {
			return modules.Failed, err
		}

		changed = true

		return modules.Done, file.Chown(ctx, dropIn, "root", "redis")
	})

	return changed, err
}

func includeConfig(ctx *modules.Context) (bool, error) {
	changed := false

	err := ctx.Step("include-config", func() (modules.Outcome, error) {
		added, err := file.EnsureLine(ctx, confPath, "include "+dropIn)
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

func storePassword(ctx *modules.Context) error {
	return ctx.Step("store-password", func() (modules.Outcome, error) {
		stored, err := env.Set(ctx, passwordKey, ctx.Secret("password"))
		if err != nil {
			return modules.Failed, err
		}

		if !stored {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
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

// The password reaches redis-cli through REDISCLI_AUTH, never through an argv ps shows; the point is to prove the server really refuses anyone without it.
func verify(ctx *modules.Context) error {
	return ctx.Step("verify-auth", func() (modules.Outcome, error) {
		input := user.Input{Env: []string{"REDISCLI_AUTH=" + ctx.Secret("password")}}
		out, err := user.RunWith(ctx, "root", input, "redis-cli", "-p", strconv.Itoa(port(ctx)), "--no-auth-warning", "ping")
		if err != nil || strings.TrimSpace(out) != "PONG" {
			return modules.Failed, errors.New(i18n.T("module.db.redis.auth.refused", unit))
		}

		return modules.Skipped, nil
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

// What Redis wrote under /var/lib/redis belongs to the client, and stays there.
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
		removed, err := env.Unset(ctx, passwordKey)
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
	status.Credentials = map[string]string{i18n.T("module.db.redis.password.label"): passwordKey}

	return status, nil
}

func port(ctx *modules.Context) int {
	chosen := ctx.Int("port")
	if chosen == 0 {
		return DefaultPort
	}

	return chosen
}

func policy(ctx *modules.Context) string {
	chosen := strings.TrimSpace(ctx.String("maxmemory_policy"))
	if !slices.Contains(policies, chosen) {
		return DefaultPolicy
	}

	return chosen
}

func renderLive(password string, persistence bool, maxmemoryMB int, policy string) string {
	lines := []string{"CONFIG SET requirepass " + quote(password)}

	if persistence {
		lines = append(lines, "CONFIG SET appendonly yes", "CONFIG SET appendfsync everysec")
	} else {
		lines = append(lines, "CONFIG SET appendonly no", `CONFIG SET save ""`)
	}

	if maxmemoryMB > 0 {
		lines = append(lines, fmt.Sprintf("CONFIG SET maxmemory %dmb", maxmemoryMB), "CONFIG SET maxmemory-policy "+policy)
	} else {
		lines = append(lines, "CONFIG SET maxmemory 0", "CONFIG SET maxmemory-policy "+noEviction)
	}

	return strings.Join(lines, "\n") + "\n"
}

// redis.conf and redis-cli read the same double-quoted string, backslash and quote escaped.
func quote(value string) string {
	return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(value) + `"`
}

func renderConfig(port int, password string, persistence bool, maxmemoryMB int, policy string) []byte {
	var out strings.Builder

	out.WriteString("bind 127.0.0.1 ::1\n")
	fmt.Fprintf(&out, "port %d\n", port)
	out.WriteString("protected-mode yes\n")
	fmt.Fprintf(&out, "requirepass %s\n", quote(password))

	if persistence {
		out.WriteString("appendonly yes\nappendfsync everysec\n")
	} else {
		out.WriteString("appendonly no\nsave \"\"\n")
	}

	if maxmemoryMB > 0 {
		fmt.Fprintf(&out, "maxmemory %dmb\nmaxmemory-policy %s\n", maxmemoryMB, policy)
	} else {
		out.WriteString("maxmemory-policy " + noEviction + "\n")
	}

	return []byte(out.String())
}
