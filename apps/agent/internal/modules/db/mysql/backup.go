package mysql

import (
	"io"
	"slices"
	"strings"
	"time"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys"
)

// A dump streams to a bucket as fast as the uplink takes it: its length is the upload's, not the database's.
const streamTimeout = 24 * time.Hour

var systemDatabases = []string{"mysql", "sys", "information_schema", "performance_schema"}

// Databases names what the server holds of the client's, without the system ones.
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

// DumpTo streams one database with what makes it again: its CREATE DATABASE, its routines, triggers and events, in one consistent read.
func DumpTo(ctx *modules.Context, name string, w io.Writer) error {
	argv := sys.Idle("mysqldump", "--protocol=socket", "--single-transaction", "--routines", "--triggers", "--events",
		"--default-character-set=utf8mb4", "--databases", name)

	_, err := sys.Exec(ctx, sys.Command{Argv: argv, Output: w, Timeout: streamTimeout})

	return err
}

// RestoreFrom drops the database; the dump creates it again with its own character set and fills it.
func RestoreFrom(ctx *modules.Context, name string, r io.Reader) error {
	if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"mysql", "--protocol=socket", "-e", "DROP DATABASE IF EXISTS `" + name + "`"}}); err != nil {
		return err
	}

	_, err := sys.Exec(ctx, sys.Command{Argv: sys.Idle("mysql", "--protocol=socket", "--default-character-set=utf8mb4"), Input: r, Output: io.Discard, Timeout: streamTimeout})

	return err
}

// The accounts the server makes for itself; with the module's two, they are never carried.
var systemAccounts = []string{"root", "mysql.sys", "mysql.session", "mysql.infoschema", "mariadb.sys", "debian-sys-maint", "PUBLIC", ""}

// DumpUsers writes the accounts the client made by hand as SQL that makes them again: each dropped and created with its password digest, then every grant, once all exist — a grant may name a role made by another line. The module's own accounts come back from its configuration.
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

// RestoreUsers replays the accounts before the databases, so a view's definer or a project's own account is there when it is needed.
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

// MySQL 8 keeps caching_sha2 digests as raw bytes; printed in hex, they survive the trip through a text file. MariaDB's are text already.
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
