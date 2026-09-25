package mongodb

import (
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
)

func TestTheDatabasesAreListedThroughAScriptThatSignsIn(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("mongosh", "pupitre-db admin\npupitre-db app\npupitre-db config\npupitre-db local\npupitre-script-done\n")

	names, err := Databases(newContext(t, fake))
	if err != nil || !slices.Equal(names, []string{"app"}) {
		t.Fatalf("names = %v, %v", names, err)
	}

	call := fake.Calls[0]
	if !strings.Contains(string(call.Stdin), appPassword) || strings.Contains(strings.Join(call.Argv, " "), appPassword) {
		t.Fatal("the password goes on the standard input, never on the command line")
	}
}

func TestAScriptThatNeverSaidItsWordHasFailed(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("mongosh", "MongoServerError: Authentication failed.\n")

	if _, err := Databases(newContext(t, fake)); err == nil || !strings.Contains(err.Error(), "Authentication failed") {
		t.Fatalf("got %v, want the refusal", err)
	}
}

func TestADumpAndARestoreReadThePasswordFromTheToolsFileAlone(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("mongodump", "archive bytes")
	fake.Answer("mongosh", "pupitre-script-done\n")
	ctx := newContext(t, fake)

	var out strings.Builder
	if err := DumpTo(ctx, "app", &out); err != nil || out.String() != "archive bytes" {
		t.Fatalf("out %q, %v", out.String(), err)
	}

	if err := RestoreFrom(ctx, "app", 13, strings.NewReader("archive bytes")); err != nil {
		t.Fatal(err)
	}

	if string(fake.FedTo("mongorestore")) != "archive bytes" || !strings.Contains(strings.Join(fake.Commands(), "\n"), "--nsInclude=app.*") {
		t.Fatalf("commands = %v", fake.Commands())
	}

	if _, kept := fake.Files[toolsConfigPath]; kept {
		t.Fatal("the credentials file lives for one command")
	}

	for _, line := range fake.Commands() {
		if strings.Contains(line, appPassword) {
			t.Fatalf("password on a command line: %s", line)
		}
	}
}

func TestADatabaseTheDiskCannotHoldAgainIsNeverDropped(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("mongosh", "pupitre-bytes 1073741824\npupitre-script-done\n")
	fake.Answer("df -P -B1 /var/lib/mongodb", "Filesystem 1-blocks Used Available Capacity Mounted on\n/dev/sda1 42949672960 0 1073741824 97% /\n")

	err := RestoreFrom(newContext(t, fake), "app", 3<<30, strings.NewReader("archive bytes"))
	if err == nil || !strings.Contains(err.Error(), "/var/lib/mongodb") {
		t.Fatalf("err = %v", err)
	}

	for _, call := range fake.Calls {
		if strings.Contains(string(call.Stdin), "dropDatabase") || strings.Contains(strings.Join(call.Argv, " "), "mongorestore") {
			t.Fatalf("a restore that cannot fit leaves the database as it is: %v", fake.Commands())
		}
	}
}
