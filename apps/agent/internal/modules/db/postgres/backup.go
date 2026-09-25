package postgres

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/db/room"
	"pupitre.studio/agent/internal/sys"
)

// A dump streams at the uplink's pace: its length is the upload's, not the database's.
const streamTimeout = 24 * time.Hour

const listDatabases = "SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate AND datname <> 'postgres' ORDER BY datname"

func Databases(ctx *modules.Context) ([]string, error) {
	out, err := psql(ctx, []string{"psql", "--no-psqlrc", "--dbname=" + defaultDatabase, "-tAc", listDatabases}, "")
	if err != nil {
		return nil, err
	}

	var names []string

	for _, line := range strings.Split(out, "\n") {
		if name := strings.TrimSpace(line); name != "" {
			names = append(names, name)
		}
	}

	return names, nil
}

func DumpTo(ctx *modules.Context, name string, w io.Writer) error {
	return stream(ctx, sys.Idle("pg_dump", "--format=custom", "--dbname="+name), nil, w)
}

func DumpRoles(ctx *modules.Context, w io.Writer) error {
	return stream(ctx, sys.Idle("pg_dumpall", "--roles-only"), nil, w)
}

// No ON_ERROR_STOP: a role that already exists, the module's own included, is not a failure.
func RestoreRoles(ctx *modules.Context, r io.Reader) error {
	return stream(ctx, []string{"psql", "--no-psqlrc", "--quiet", "--dbname=" + defaultDatabase}, r, io.Discard)
}

// The live database is renamed aside until pg_restore succeeds, so the disk must hold both: it is weighed first.
func RestoreFrom(ctx *modules.Context, name string, size int64, r io.Reader) error {
	if err := room.Check(ctx, name, dataHome, size, 0); err != nil {
		return err
	}

	aside := asideName(name)
	if exists(ctx, aside) {
		return errors.New(i18n.T("backup.postgres.aside", name, aside, name))
	}

	held := exists(ctx, name)
	if held {
		if err := rename(ctx, name, aside, false); err != nil {
			return errors.Join(err, reopen(ctx, name))
		}
	}

	if err := stream(ctx, sys.Idle("pg_restore", "--create", "--no-password", "--dbname="+defaultDatabase), r, io.Discard); err != nil {
		if held {
			return errors.Join(err, putBack(ctx, name, aside))
		}

		return err
	}

	if held {
		if _, err := psql(ctx, []string{"dropdb", "--if-exists", "--force", aside}, ""); err != nil {
			ctx.Logf("%s restored, the copy of before left as %s: %s", name, aside, err)
		}
	}

	return nil
}

// Hashed so every database gets its own name within the 63 bytes Postgres keeps of one.
func asideName(name string) string {
	digest := sha256.Sum256([]byte(name))

	return "pupitre_aside_" + hex.EncodeToString(digest[:8])
}

func exists(ctx *modules.Context, name string) bool {
	return count(ctx, defaultDatabase, "SELECT 1 FROM pg_database WHERE datname = '"+name+"'") == "1"
}

func rename(ctx *modules.Context, from, to string, allow bool) error {
	script := strings.Join([]string{
		`ALTER DATABASE "` + from + `" ALLOW_CONNECTIONS false;`,
		`SELECT pg_terminate_backend(pid, 10000) FROM pg_stat_activity WHERE datname = '` + from + `' AND pid <> pg_backend_pid();`,
		`ALTER DATABASE "` + from + `" RENAME TO "` + to + `";`,
		`ALTER DATABASE "` + to + `" ALLOW_CONNECTIONS ` + strconv.FormatBool(allow) + `;`,
		"",
	}, "\n")

	_, err := psql(ctx, []string{"psql", "--no-psqlrc", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname=" + defaultDatabase}, script)

	return err
}

func reopen(ctx *modules.Context, name string) error {
	_, err := psql(ctx, []string{"psql", "--no-psqlrc", "--quiet", "--dbname=" + defaultDatabase, "-c", `ALTER DATABASE "` + name + `" ALLOW_CONNECTIONS true`}, "")

	return err
}

func putBack(ctx *modules.Context, name, aside string) error {
	if _, err := psql(ctx, []string{"dropdb", "--if-exists", "--force", name}, ""); err != nil {
		return err
	}

	return rename(ctx, aside, name, true)
}

func stream(ctx *modules.Context, argv []string, in io.Reader, out io.Writer) error {
	_, err := sys.Exec(ctx, sys.Command{User: "postgres", Dir: dataHome, Argv: argv, Input: in, Output: out, Timeout: streamTimeout})

	return err
}
