package mongodb

import (
	"errors"
	"io"
	"slices"
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

const (
	listedPrefix  = "pupitre-db "
	weighedPrefix = "pupitre-bytes "
	scriptDone    = "pupitre-script-done"
	dataDir       = "/var/lib/mongodb"
)

var systemDatabases = []string{"admin", "config", "local"}

func Databases(ctx *modules.Context) ([]string, error) {
	out, err := script(ctx, `admin.adminCommand({ listDatabases: 1, nameOnly: true }).databases.forEach((entry) => print("`+listedPrefix+`" + entry.name));`)
	if err != nil {
		return nil, err
	}

	var names []string

	for _, line := range strings.Split(out, "\n") {
		if name, listed := strings.CutPrefix(strings.TrimSpace(line), listedPrefix); listed && !slices.Contains(systemDatabases, name) {
			names = append(names, name)
		}
	}

	return names, nil
}

func DumpTo(ctx *modules.Context, name string, w io.Writer) error {
	return withCredentials(ctx, func(credentials []string) error {
		argv := sys.Idle(append(append([]string{"mongodump"}, credentials...), "--db="+name, "--archive")...)
		_, err := sys.Exec(ctx, sys.Command{Argv: argv, Output: w, Timeout: streamTimeout})

		return err
	})
}

// MongoDB renames no database, so instead of a swap the disk is weighed against what the drop gives back.
func RestoreFrom(ctx *modules.Context, name string, size int64, r io.Reader) error {
	held, err := weight(ctx, name)
	if err != nil {
		return err
	}

	if err := room.Check(ctx, name, dataDir, size, held); err != nil {
		return err
	}

	if _, err := script(ctx, `admin.getSiblingDB(`+strconv.Quote(name)+`).dropDatabase();`); err != nil {
		return err
	}

	return withCredentials(ctx, func(credentials []string) error {
		argv := sys.Idle(append(append([]string{"mongorestore"}, credentials...), "--archive", "--drop", "--nsInclude="+name+".*")...)
		_, err := sys.Exec(ctx, sys.Command{Argv: argv, Input: r, Output: io.Discard, Timeout: streamTimeout})

		return err
	})
}

func weight(ctx *modules.Context, name string) (int64, error) {
	out, err := script(ctx, `const held = admin.getSiblingDB(`+strconv.Quote(name)+`).stats(); print("`+weighedPrefix+`" + Math.trunc(Number(held.storageSize) + Number(held.indexSize)));`)
	if err != nil {
		return 0, err
	}

	for _, line := range strings.Split(out, "\n") {
		if value, weighed := strings.CutPrefix(strings.TrimSpace(line), weighedPrefix); weighed {
			bytes, _ := strconv.ParseInt(value, 10, 64)

			return bytes, nil
		}
	}

	return 0, nil
}

// mongosh exits 0 on an uncaught error: only the script's closing word proves it ran through.
func script(ctx *modules.Context, body string) (string, error) {
	lines := strings.Join([]string{
		`const admin = db.getSiblingDB("` + authDatabase + `");`,
		`admin.auth("` + appUser(ctx) + `", ` + strconv.Quote(ctx.Secret("app_password")) + `);`,
		body,
		`print("` + scriptDone + `");`,
		"",
	}, "\n")

	argv := []string{"mongosh", "--quiet", "--host", loopback, "--port", strconv.Itoa(port(ctx))}

	out, err := sys.Exec(ctx, sys.Command{Argv: argv, Stdin: []byte(lines)})
	if err != nil {
		return "", err
	}

	if !strings.Contains(out.Stdout, scriptDone) {
		return "", errors.New(i18n.T("backup.mongodb.refused", lastLine(out.Stdout)))
	}

	return out.Stdout, nil
}
