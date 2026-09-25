package mysql

import (
	"io"
	"slices"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/db/room"
	"pupitre.studio/agent/internal/sys"
)

// A dump streams at the uplink's pace: its length is the upload's, not the database's.
const streamTimeout = 24 * time.Hour

const dataDir = "/var/lib/mysql"

var systemDatabases = []string{"mysql", "sys", "information_schema", "performance_schema"}

func Databases(ctx *modules.Context) ([]string, error) {
	out, err := sys.Exec(ctx, sys.Command{Argv: []string{"mysql", "--protocol=socket", "-N", "-B", "-e", "SHOW DATABASES"}})
	if err != nil {
		return nil, err
	}

	var names []string

	for _, line := range strings.Split(out.Stdout, "\n") {
		if name := strings.TrimSpace(line); name != "" && !slices.Contains(systemDatabases, name) {
			names = append(names, name)
		}
	}

	return names, nil
}

func DumpTo(ctx *modules.Context, name string, w io.Writer) error {
	argv := sys.Idle("mysqldump", "--protocol=socket", "--single-transaction", "--routines", "--triggers", "--events",
		"--default-character-set=utf8mb4", "--databases", name)

	_, err := sys.Exec(ctx, sys.Command{Argv: argv, Output: w, Timeout: streamTimeout})

	return err
}

// A dump names its database inside its SQL, so it cannot load aside and swap in: the disk is weighed before the drop.
func RestoreFrom(ctx *modules.Context, name string, size int64, r io.Reader) error {
	held, err := weight(ctx, name)
	if err != nil {
		return err
	}

	if err := room.Check(ctx, name, dataDir, size, held); err != nil {
		return err
	}

	if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"mysql", "--protocol=socket", "-e", "DROP DATABASE IF EXISTS `" + name + "`"}}); err != nil {
		return err
	}

	_, err = sys.Exec(ctx, sys.Command{Argv: sys.Idle("mysql", "--protocol=socket", "--default-character-set=utf8mb4"), Input: r, Output: io.Discard, Timeout: streamTimeout})

	return err
}

func weight(ctx *modules.Context, name string) (int64, error) {
	lines, err := ask(ctx, "SELECT COALESCE(SUM(data_length + index_length), 0) FROM information_schema.tables WHERE table_schema = '"+quote(name)+"'")
	if err != nil || len(lines) == 0 {
		return 0, err
	}

	bytes, _ := strconv.ParseInt(strings.TrimSpace(lines[0]), 10, 64)

	return bytes, nil
}

var systemAccounts = []string{"root", "mysql.sys", "mysql.session", "mysql.infoschema", "mariadb.sys", "debian-sys-maint", "PUBLIC", ""}

// Grants come after every CREATE USER, since a grant may name a role another line creates.
func DumpUsers(ctx *modules.Context, w io.Writer) error {
	accounts, err := handMadeAccounts(ctx)
	if err != nil {
		return err
	}

	var made, granted []string

	for _, account := range accounts {
		lines, err := ask(ctx, digestsAsHex(ctx)+"SHOW CREATE USER "+account+"; SHOW GRANTS FOR "+account)
		if err != nil {
			return err
		}

		if len(lines) == 0 {
			continue
		}

		made = append(made, "DROP USER IF EXISTS "+account, lines[0])
		granted = append(granted, lines[1:]...)
	}

	script := append(append(made, granted...), "FLUSH PRIVILEGES")

	_, err = io.WriteString(w, strings.Join(script, ";\n")+";\n")

	return err
}

// Replayed before the databases, so a view's definer exists when the view is created.
func RestoreUsers(ctx *modules.Context, r io.Reader) error {
	_, err := sys.Exec(ctx, sys.Command{Argv: []string{"mysql", "--protocol=socket", "--default-character-set=utf8mb4"}, Input: r, Output: io.Discard, Timeout: streamTimeout})

	return err
}

func handMadeAccounts(ctx *modules.Context) ([]string, error) {
	kept := append(slices.Clone(systemAccounts), appAccount(ctx), remoteAccount(ctx))

	quoted := make([]string, 0, len(kept))

	for _, name := range kept {
		quoted = append(quoted, "'"+quote(name)+"'")
	}

	return ask(ctx, "SELECT CONCAT(QUOTE(User), '@', QUOTE(Host)) FROM mysql.user WHERE User NOT IN ("+strings.Join(quoted, ", ")+") ORDER BY User, Host")
}

// MySQL 8 caching_sha2 digests are raw bytes that only survive a text file in hex; MariaDB's are text already.
func digestsAsHex(ctx *modules.Context) string {
	if ctx.String("engine") == mariadbEngine {
		return ""
	}

	return "SET SESSION print_identified_with_as_hex = ON; "
}

func ask(ctx *modules.Context, statement string) ([]string, error) {
	out, err := sys.Exec(ctx, sys.Command{Argv: []string{"mysql", "--protocol=socket", "-N", "-B", "--raw", "-e", statement}})
	if err != nil {
		return nil, err
	}

	var lines []string

	for _, line := range strings.Split(out.Stdout, "\n") {
		if line = strings.TrimRight(line, "\r"); line != "" {
			lines = append(lines, line)
		}
	}

	return lines, nil
}
