package dumps

import (
	"io"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
)

func dumping(content string) func(io.Writer) error {
	return func(out io.Writer) error {
		_, err := io.WriteString(out, content)

		return err
	}
}

// Root streams the dump into a file it makes for dev: never a tool writing to a path, which would follow a link dev planted there.
func TestWriteStreamsTheDumpIntoAFileOfDevs(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files["/etc/cron.d/backup"] = []byte("root job")
	ctx := newContext(t, fake)
	path := Dir + "/shop_20260904-1200.sql"
	fake.Links[path] = "/etc/cron.d/backup"

	written, size, err := Write(ctx, "shop", ".sql", dumping("CREATE TABLE t;\n"))
	if err != nil {
		t.Fatal(err)
	}

	if written != path || size != int64(len("CREATE TABLE t;\n")) {
		t.Fatalf("Write = %q, %d", written, size)
	}

	if string(fake.Files[path]) != "CREATE TABLE t;\n" || string(fake.Files["/etc/cron.d/backup"]) != "root job" {
		t.Fatalf("the dump lands at its own name, the link's target is left alone: %q", fake.Files["/etc/cron.d/backup"])
	}

	if fake.Owners[path] != "dev:dev" || fake.Owners[Dir] != "dev:dev" {
		t.Fatalf("~/dumps %q, dump %q: both must belong to dev", fake.Owners[Dir], fake.Owners[path])
	}
}

func TestWriteRefusesADumpsFolderThatLeadsOutOfTheHome(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Links[Dir] = "/etc/cron.d"
	ctx := newContext(t, fake)

	if _, _, err := Write(ctx, "shop", ".sql", dumping("* * * * * root sh")); err == nil {
		t.Fatal("~/dumps leading out of the home must be refused")
	}

	for path := range fake.Files {
		if strings.HasPrefix(path, "/etc/") {
			t.Fatalf("nothing may land out of the home: %s", path)
		}
	}
}

func TestAFailedDumpLeavesNoHalfFileBehind(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake)

	failing := func(out io.Writer) error {
		io.WriteString(out, "CREATE TA")

		return io.ErrUnexpectedEOF
	}

	if _, _, err := Write(ctx, "shop", ".sql", failing); err == nil {
		t.Fatal("the failure must be said")
	}

	if _, left := fake.Files[Dir+"/shop_20260904-1200.sql"]; left {
		t.Fatal("half a dump must not be left to be imported later")
	}
}
