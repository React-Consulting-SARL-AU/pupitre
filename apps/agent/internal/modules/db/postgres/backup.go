package postgres

import (
	"io"
	"strings"
	"time"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys"
)

// A dump streams to a bucket as fast as the uplink takes it: its length is the upload's, not the database's.
const streamTimeout = 24 * time.Hour

const listDatabases = "SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate AND datname <> 'postgres' ORDER BY datname"

// Databases names what the cluster holds of the client's, without the system ones.
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

// DumpTo streams one database in pg_dump's custom format. The postgres account reads every database on its own socket, whoever owns it.
func DumpTo(ctx *modules.Context, name string, w io.Writer) error {
	return stream(ctx, sys.Idle("pg_dump", "--format=custom", "--dbname="+name), nil, w)
}

// DumpRoles streams every role with its password digest: the ones the client made by hand beside the module's.
func DumpRoles(ctx *modules.Context, w io.Writer) error {
	return stream(ctx, sys.Idle("pg_dumpall", "--roles-only"), nil, w)
}

// RestoreRoles replays the roles without stopping on the first error: a role already there, the module's own included, is not one.
func RestoreRoles(ctx *modules.Context, r io.Reader) error {
	return stream(ctx, []string{"psql", "--no-psqlrc", "--quiet", "--dbname=" + defaultDatabase}, r, io.Discard)
}

// RestoreFrom drops the database, sessions and all, and lets pg_restore create it again as the dump describes it — owner, encoding and all.
func RestoreFrom(ctx *modules.Context, name string, r io.Reader) error {
	if _, err := psql(ctx, []string{"dropdb", "--if-exists", "--force", name}, ""); err != nil {
		return err
	}

	return stream(ctx, sys.Idle("pg_restore", "--create", "--no-password", "--dbname="+defaultDatabase), r, io.Discard)
}

func stream(ctx *modules.Context, argv []string, in io.Reader, out io.Writer) error {
	_, err := sys.Exec(ctx, sys.Command{User: "postgres", Dir: dataHome, Argv: argv, Input: in, Output: out, Timeout: streamTimeout})

	return err
}
