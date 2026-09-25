package redis

import (
	"errors"
	"io"
	"path"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	streamTimeout = 24 * time.Hour
	settleTimeout = 10 * time.Minute
	settlePoll    = time.Second

	defaultDir      = "/var/lib/redis"
	defaultFilename = "dump.rdb"
	incomingSuffix  = ".restoring"
	owner           = "redis"
)

// Snapshot has Redis write its RDB in the background, waits for it, and streams the file it wrote.
func Snapshot(ctx *modules.Context, w io.Writer) error {
	dir, filename := where(ctx)

	before, err := cli(ctx, "LASTSAVE")
	if err != nil {
		return err
	}

	reply, err := cli(ctx, "BGSAVE", "SCHEDULE")
	if err != nil {
		return err
	}

	// A save that started and ended within the second of the one before leaves LASTSAVE where it was: the fork being over says it as well.
	started := strings.Contains(reply, "started")
	saved := func() (bool, error) {
		now, err := cli(ctx, "LASTSAVE")
		if err != nil || now != before {
			return err == nil, err
		}

		info, err := cli(ctx, "INFO", "persistence")

		return started && field(info, "rdb_bgsave_in_progress") == "0", err
	}
	if err := until(ctx, saved, "backup.redis.snapshot.timeout"); err != nil {
		return err
	}

	info, err := cli(ctx, "INFO", "persistence")
	if err != nil {
		return err
	}

	if field(info, "rdb_last_bgsave_status") != "ok" {
		return errors.New(i18n.T("backup.redis.snapshot.failed", unit))
	}

	_, err = sys.Exec(ctx, sys.Command{Argv: sys.Idle("cat", path.Join(dir, filename)), Output: w, Timeout: streamTimeout})

	return err
}

// A server persisting through its append-only file would start empty on an RDB alone: it starts once without it, then turns it back on live, which rewrites it from the snapshot.
func RestoreSnapshot(ctx *modules.Context, r io.Reader) error {
	dir, filename := where(ctx)

	if err := systemd.Stop(ctx, unit); err != nil {
		return err
	}

	if err := swapIn(ctx, dir, filename, r); err != nil {
		return errors.Join(err, systemd.Restart(ctx, unit))
	}

	if !ctx.Bool("persistence") {
		return systemd.Restart(ctx, unit)
	}

	if err := writeDropIn(ctx, false); err != nil {
		return err
	}

	started := systemd.Restart(ctx, unit)
	if started == nil {
		started = persistLive(ctx)
	}

	if err := writeDropIn(ctx, true); err != nil {
		return err
	}

	return started
}

// swapIn lays the snapshot beside the live one and renames it over it only once whole: until then the server's own files, append-only ones included, are untouched.
func swapIn(ctx *modules.Context, dir, filename string, r io.Reader) error {
	incoming := filename + incomingSuffix

	if err := receive(ctx, dir, incoming, r); err != nil {
		_ = ctx.Sys().RemoveIn(dir, incoming, false)

		return err
	}

	if err := ctx.Sys().RenameIn(dir, incoming, filename); err != nil {
		_ = ctx.Sys().RemoveIn(dir, incoming, false)

		return err
	}

	for _, stale := range []string{"appendonlydir", "appendonly.aof"} {
		if err := ctx.Sys().RemoveIn(dir, stale, true); err != nil {
			return err
		}
	}

	return nil
}

func receive(ctx *modules.Context, dir, name string, r io.Reader) error {
	ctx.Logf("snapshot streamed into %s", path.Join(dir, name))

	out, err := ctx.Sys().CreateIn(dir, name, owner)
	if err != nil {
		return err
	}

	_, err = io.Copy(out, r)
	if synced, durable := out.(interface{ Sync() error }); durable && err == nil {
		err = synced.Sync()
	}

	if closed := out.Close(); err == nil {
		err = closed
	}

	return err
}

func persistLive(ctx *modules.Context) error {
	input := user.Input{
		Env:   auth(ctx),
		Stdin: []byte(renderLive(ctx.Secret("password"), true, ctx.Int("maxmemory_mb"), policy(ctx))),
	}
	if _, err := user.RunWith(ctx, "root", input, "redis-cli", "-p", strconv.Itoa(port(ctx)), "--no-auth-warning"); err != nil {
		return err
	}

	rewritten := func() (bool, error) {
		info, err := cli(ctx, "INFO", "persistence")

		return field(info, "aof_enabled") == "1" && field(info, "aof_rewrite_in_progress") == "0" && field(info, "aof_rewrite_scheduled") == "0", err
	}

	return until(ctx, rewritten, "backup.redis.rewrite.timeout")
}

func writeDropIn(ctx *modules.Context, persistent bool) error {
	return file.WriteAtomic(ctx, dropIn, renderConfig(port(ctx), ctx.Secret("password"), persistent, ctx.Int("maxmemory_mb"), policy(ctx)), 0o640)
}

// where reads the folder and the file the server writes its snapshot to, the package's own defaults when it does not answer.
func where(ctx *modules.Context) (string, string) {
	dir, filename := defaultDir, defaultFilename

	if out, err := cli(ctx, "CONFIG", "GET", "dir"); err == nil {
		if value := second(out); value != "" {
			dir = value
		}
	}

	if out, err := cli(ctx, "CONFIG", "GET", "dbfilename"); err == nil {
		if value := second(out); value != "" {
			filename = value
		}
	}

	return dir, filename
}

// The password rides on REDISCLI_AUTH, never on an argv ps shows; the commands themselves carry nothing secret.
func cli(ctx *modules.Context, words ...string) (string, error) {
	argv := append([]string{"redis-cli", "-p", strconv.Itoa(port(ctx)), "--no-auth-warning"}, words...)
	out, err := sys.Exec(ctx, sys.Command{Argv: argv, Env: auth(ctx)})
	if err != nil {
		return "", err
	}

	if strings.HasPrefix(strings.TrimSpace(out.Stdout), "ERR") {
		return "", errors.New(strings.TrimSpace(out.Stdout))
	}

	return strings.TrimSpace(out.Stdout), nil
}

func auth(ctx *modules.Context) []string {
	return []string{"REDISCLI_AUTH=" + ctx.Secret("password")}
}

func until(ctx *modules.Context, done func() (bool, error), timeout string) error {
	deadline := time.Now().Add(settleTimeout)

	for {
		finished, err := done()
		if err != nil {
			return err
		}

		if finished {
			return nil
		}

		if time.Now().After(deadline) {
			return errors.New(i18n.T(timeout, unit))
		}

		ctx.Logf("%s still at work, asked again in %s", unit, settlePoll)
		time.Sleep(settlePoll)
	}
}

func field(info, name string) string {
	for _, line := range strings.Split(info, "\n") {
		if value, found := strings.CutPrefix(strings.TrimSpace(line), name+":"); found {
			return strings.TrimSpace(value)
		}
	}

	return ""
}

func second(out string) string {
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) < 2 {
		return ""
	}

	return strings.TrimSpace(lines[1])
}
