package postgres

import (
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
)

func TestTheDatabasesOfTheClientAreListedWithoutTheSystemOnes(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("FROM pg_database WHERE datallowconn", "shop\nflyleaf\n")

	names, err := Databases(newContext(t, fake))
	if err != nil || !slices.Equal(names, []string{"shop", "flyleaf"}) {
		t.Fatalf("names = %v, %v", names, err)
	}

	if fake.Calls[0].User != "postgres" {
		t.Fatal("the cluster is read on its own socket, as postgres")
	}
}

func TestADumpStreamsAsPostgresBehindEverythingElse(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("pg_dump --format=custom --dbname=shop", "PGDMP")

	var out strings.Builder
	if err := DumpTo(newContext(t, fake), "shop", &out); err != nil {
		t.Fatal(err)
	}

	call := fake.Calls[0]
	if out.String() != "PGDMP" || call.User != "postgres" || !slices.Equal(call.Argv[:5], []string{"nice", "-n", "10", "ionice", "-c3"}) {
		t.Fatalf("out %q, call %+v", out.String(), call)
	}

	for _, word := range call.Argv {
		if strings.Contains(word, appPassword) {
			t.Fatal("no password on a command line")
		}
	}
}

func scripts(fake *modtest.FakeSys) string {
	var fed []string

	for _, call := range fake.Calls {
		fed = append(fed, string(call.Stdin))
	}

	return strings.Join(fed, "\n")
}

func TestARestoreSetsTheDatabaseAsideAndLetsTheDumpCreateIt(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("datname = 'shop'", "1\n")
	aside := asideName("shop")

	if err := RestoreRoles(newContext(t, fake), strings.NewReader("CREATE ROLE app;")); err != nil {
		t.Fatal(err)
	}

	if err := RestoreFrom(newContext(t, fake), "shop", 5, strings.NewReader("PGDMP")); err != nil {
		t.Fatal(err)
	}

	commands := strings.Join(fake.Commands(), "\n")
	if strings.Contains(commands, "--force shop") || !strings.Contains(scripts(fake), `ALTER DATABASE "shop" RENAME TO "`+aside+`"`) {
		t.Fatalf("the database of before is renamed, never dropped first:\n%s", commands)
	}

	if strings.Index(commands, "pg_restore --create") > strings.Index(commands, "dropdb --if-exists --force "+aside) {
		t.Fatalf("the copy of before goes once the restore went through:\n%s", commands)
	}

	if string(fake.FedTo("pg_restore")) != "PGDMP" || string(fake.FedTo("psql --no-psqlrc --quiet --dbname")) != "CREATE ROLE app;" {
		t.Fatal("each command reads its own stream")
	}

	if len(aside) > 63 {
		t.Fatalf("%s is longer than Postgres keeps", aside)
	}
}

func TestARestoreThatFailsPutsTheDatabaseOfBeforeBack(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("datname = 'shop'", "1\n")
	fake.FailLine("pg_restore --create", "pg_restore: error: could not write to file: No space left on device")
	aside := asideName("shop")

	err := RestoreFrom(newContext(t, fake), "shop", 5, strings.NewReader("PGDMP"))
	if err == nil || !strings.Contains(err.Error(), "No space left") {
		t.Fatalf("err = %v", err)
	}

	commands := strings.Join(fake.Commands(), "\n")
	if strings.Index(commands, "dropdb --if-exists --force shop") < strings.Index(commands, "pg_restore --create") || strings.Contains(commands, "--force "+aside) {
		t.Fatalf("what the failed restore left goes, the copy of before stays:\n%s", commands)
	}

	if !strings.Contains(scripts(fake), `ALTER DATABASE "`+aside+`" RENAME TO "shop";`+"\n"+`ALTER DATABASE "shop" ALLOW_CONNECTIONS true;`) {
		t.Fatalf("the database of before takes its name back, open again:\n%s", scripts(fake))
	}
}

func TestADatabaseLeftAsideByAnInterruptedRestoreIsNeverOverwritten(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("datname = '"+asideName("shop")+"'", "1\n")

	err := RestoreFrom(newContext(t, fake), "shop", 5, strings.NewReader("PGDMP"))
	if err == nil || !strings.Contains(err.Error(), asideName("shop")) {
		t.Fatalf("err = %v", err)
	}

	if commands := strings.Join(fake.Commands(), "\n"); strings.Contains(commands, "pg_restore") || strings.Contains(commands, "dropdb") {
		t.Fatalf("nothing is touched:\n%s", commands)
	}
}

func TestAFreshServerRestoresWithoutSettingAnythingAside(t *testing.T) {
	fake := modtest.NewFakeSys()

	if err := RestoreFrom(newContext(t, fake), "shop", 5, strings.NewReader("PGDMP")); err != nil {
		t.Fatal(err)
	}

	if strings.Contains(scripts(fake), "RENAME") || strings.Contains(strings.Join(fake.Commands(), "\n"), "dropdb") {
		t.Fatalf("nothing to set aside:\n%s", strings.Join(fake.Commands(), "\n"))
	}
}

func TestARestoreTheDiskCannotHoldTouchesNothing(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("datname = 'shop'", "1\n")
	fake.Answer("df -P -B1 /var/lib/postgresql", "Filesystem 1-blocks Used Available Capacity Mounted on\n/dev/sda1 42949672960 0 1073741824 97% /\n")

	err := RestoreFrom(newContext(t, fake), "shop", 2<<30, strings.NewReader("PGDMP"))
	if err == nil || !strings.Contains(err.Error(), "/var/lib/postgresql") {
		t.Fatalf("err = %v", err)
	}

	if strings.Contains(scripts(fake), "RENAME") || strings.Contains(strings.Join(fake.Commands(), "\n"), "pg_restore") {
		t.Fatal("a restore that cannot fit leaves the cluster as it is")
	}
}
