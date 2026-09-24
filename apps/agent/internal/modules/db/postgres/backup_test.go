package postgres

import (
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
)

func TestTheDatabasesOfTheClientAreListedWithoutTheSystemOnes(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("FROM pg_database WHERE datallowconn", "shop\nflymate\n")

	names, err := Databases(newContext(t, fake))
	if err != nil || !slices.Equal(names, []string{"shop", "flymate"}) {
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

func TestARestoreDropsTheDatabaseAndLetsTheDumpCreateIt(t *testing.T) {
	fake := modtest.NewFakeSys()

	if err := RestoreRoles(newContext(t, fake), strings.NewReader("CREATE ROLE app;")); err != nil {
		t.Fatal(err)
	}

	if err := RestoreFrom(newContext(t, fake), "shop", strings.NewReader("PGDMP")); err != nil {
		t.Fatal(err)
	}

	commands := strings.Join(fake.Commands(), "\n")
	if strings.Contains(commands, "ON_ERROR_STOP") || strings.Index(commands, "dropdb --if-exists --force shop") > strings.Index(commands, "pg_restore --create") {
		t.Fatalf("a role already there is not an error, the drop comes first:\n%s", commands)
	}

	if string(fake.FedTo("pg_restore")) != "PGDMP" || string(fake.FedTo("psql --no-psqlrc --quiet")) != "CREATE ROLE app;" {
		t.Fatal("each command reads its own stream")
	}
}
