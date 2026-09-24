package redis

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sys"
)

func snapshotting(fake *modtest.FakeSys) {
	fake.Answer("CONFIG GET dir", "dir\n/data/redis\n")
	fake.Answer("CONFIG GET dbfilename", "dbfilename\nsnapshot.rdb\n")
	fake.Answer("LASTSAVE", "100\n")
	fake.Answer("BGSAVE", "Background saving scheduled\n")
	fake.Answer("INFO persistence", "rdb_bgsave_in_progress:1\nrdb_last_bgsave_status:ok\naof_enabled:1\naof_rewrite_in_progress:0\naof_rewrite_scheduled:0\n")
	fake.Answer("cat /data/redis/snapshot.rdb", "REDIS0011")

	fake.Observe = func(cmd sys.Command) {
		if strings.Contains(strings.Join(cmd.Argv, " "), "BGSAVE") {
			fake.Answer("LASTSAVE", "101\n")
		}
	}
}

func TestASnapshotIsWaitedForThenStreamed(t *testing.T) {
	fake := modtest.NewFakeSys()
	snapshotting(fake)

	var out strings.Builder
	if err := Snapshot(newContext(t, fake, nil), &out); err != nil {
		t.Fatal(err)
	}

	if out.String() != "REDIS0011" {
		t.Fatalf("out = %q", out.String())
	}

	for _, call := range fake.Calls {
		if strings.Contains(strings.Join(call.Argv, " "), password) {
			t.Fatal("the password rides on REDISCLI_AUTH, never on a command line")
		}
	}
}

func TestARestoreOnAnAppendOnlyServerLoadsTheSnapshotThenPersistsItLive(t *testing.T) {
	fake := modtest.NewFakeSys()
	snapshotting(fake)
	fake.Units[unit] = modtest.UnitActive

	if err := RestoreSnapshot(newContext(t, fake, modtest.Values{"persistence": true}), strings.NewReader("REDIS0011")); err != nil {
		t.Fatal(err)
	}

	if string(fake.FedTo("dd of=/data/redis/snapshot.rdb")) != "REDIS0011" {
		t.Fatal("the snapshot must land where the server reads it")
	}

	var live string
	for _, call := range fake.Calls {
		if strings.Contains(string(call.Stdin), "CONFIG SET appendonly yes") {
			live = string(call.Stdin)
		}
	}

	if live == "" || !strings.Contains(string(fake.Files[dropIn]), "appendonly yes") {
		t.Fatalf("the append-only file is turned back on live and in the drop-in: %q", fake.Files[dropIn])
	}

	if fake.Restarts[unit] != 1 {
		t.Fatalf("restarts = %d", fake.Restarts[unit])
	}
}
