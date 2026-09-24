package backup_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/s3/s3test"
)

const otherPrivateKey = "/sWQHRA2t2CN8zBMbx/nzyyryS0TWLuQPJaLdUAW88w="

// backedUp is a server that made one backup, and the bucket that holds it.
func backedUp(t *testing.T) (*s3test.Fake, *bench, contract.BackupRunResult) {
	t.Helper()

	bucket := s3test.New(t, bucketName)
	source := newBench(t, bucket).configured()

	return bucket, source, source.run(contract.BackupTriggerManual)
}

func keys(parts []contract.BackupPart) []string {
	var listed []string
	for _, part := range parts {
		listed = append(listed, part.Key)
	}

	return listed
}

func refusalCode(err error) contract.ErrorCode {
	var refusal *protocol.Error
	if errors.As(err, &refusal) {
		return refusal.Code
	}

	return ""
}

func TestAFreshServerComesBackAsTheBackupLeftIt(t *testing.T) {
	bucket, source, made := backedUp(t)
	location := source.location()

	fresh := newBench(t, bucket)
	fresh.fake.Files[serverIDPath] = []byte("srv_new\n")

	setup, err := fresh.service.RestoreSetup(nil, location, fresh.secrets(), false)
	if err != nil {
		t.Fatal(err)
	}

	if !bytes.Equal(fresh.fake.Files[installPath], source.fake.Files[installPath]) || string(fresh.fake.Files[fresh.paths.Running]) != runningWindows {
		t.Fatal("the configuration must be the backup's, byte for byte at the same revision")
	}

	if setup.ID != made.ID || !slices.Equal(setup.Projects, []string{projectName}) || len(setup.Dropped) != 0 || len(setup.Extra) != 0 || !slices.Contains(setup.Modules, "db.postgres") {
		t.Fatalf("setup = %+v", setup)
	}

	if slices.Contains(keys(setup.Parts), "setup.pupitre") || len(setup.Parts) != len(made.Parts)-1 {
		t.Fatalf("the data parts are what is left to bring back: %v", keys(setup.Parts))
	}

	if _, marked := fresh.fake.Files["/var/lib/pupitre/restore.json"]; !marked {
		t.Fatal("a restore under way leaves its marker")
	}

	fresh.fake.Packages["postgresql-17"] = "17.2"
	fresh.fake.Packages["redis-server"] = "7.0.15"
	fresh.fake.Units["redis-server"] = modtest.UnitActive
	project := filepath.Join(fresh.projects, projectName)
	fresh.fake.Dirs[project] = true

	data, err := fresh.service.RestoreData(nil, location, fresh.secrets(), keys(setup.Parts), true)
	if err != nil {
		t.Fatal(err)
	}

	if len(data.Failed) != 0 || len(data.Restored) != len(setup.Parts) || !slices.Equal(data.Started, []string{projectName}) {
		t.Fatalf("data = %+v", data)
	}

	for definition, value := range map[string]any{"BackupRestoreSetupResult": setup, "BackupRestoreDataResult": data} {
		if err := contract.ValidateValue(definition, value); err != nil {
			t.Fatalf("%s: %v", definition, err)
		}
	}

	for rel, want := range map[string]string{
		".ssh/id_ed25519":              "private key of dev",
		".claude.json":                 `{"session":"signed in"}`,
		"notes/todo.md":                "- restore everything",
		"projects/intranet/.git/HEAD":  "ref: refs/heads/feature\n",
		"projects/intranet/.env.local": "SECRET=1",
		"projects/intranet/src/a.ts":   "export const a = 1",
	} {
		got, err := os.ReadFile(filepath.Join(fresh.home, rel))
		if err != nil || string(got) != want {
			t.Fatalf("%s = %q, %v", rel, got, err)
		}
	}

	for _, rel := range []string{".ssh/authorized_keys", "projects/intranet/node_modules"} {
		if _, err := os.Stat(filepath.Join(fresh.home, rel)); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("%s must not come back", rel)
		}
	}

	if string(fresh.fake.FedTo("pg_restore --create")) != pgDump || string(fresh.fake.FedTo("psql --no-psqlrc --quiet")) != pgRoles || string(fresh.fake.FedTo("dd of=/var/lib/redis/dump.rdb")) != redisSnapshot {
		t.Fatal("each engine must read its own dump")
	}

	commands := strings.Join(fresh.fake.Commands(), "\n")
	roles, database := strings.Index(commands, "psql --no-psqlrc --quiet"), strings.Index(commands, "pg_restore")
	if roles < 0 || database < roles || !strings.Contains(commands, "dropdb --if-exists --force shop") {
		t.Fatalf("roles come first, a database is dropped before its import:\n%s", commands)
	}

	if !strings.Contains(commands, "bun install") {
		t.Fatalf("a restored project gets its dependencies back:\n%s", commands)
	}

	if _, marked := fresh.fake.Files["/var/lib/pupitre/restore.json"]; marked {
		t.Fatal("the marker goes at the end of the restore")
	}
}

func TestAnInstalledServerIsOnlyRevertedWhenAsked(t *testing.T) {
	bucket, source, _ := backedUp(t)
	location := source.location()

	installed := newBench(t, bucket).configured()
	installed.fake.Files[installed.paths.Local] = registryOf("legacy", "git@github.com:pupitre/legacy.git")
	installed.install(map[string]any{"modules": []string{"core.system", "ai.claude"}})

	_, err := installed.service.RestoreSetup(nil, location, installed.secrets(), false)
	if refusalCode(err) != contract.ErrorBadRequest {
		t.Fatalf("got %v, want bad_request", err)
	}

	setup, err := installed.service.RestoreSetup(nil, location, installed.secrets(), true)
	if err != nil {
		t.Fatal(err)
	}

	if !slices.Equal(setup.Dropped, []string{"legacy"}) || !slices.Equal(setup.Extra, []string{"ai.claude"}) {
		t.Fatalf("setup = %+v", setup)
	}
}

func TestAnAbortPutsBackWhatTheMachineHeld(t *testing.T) {
	bucket, source, _ := backedUp(t)
	location := source.location()

	fresh := newBench(t, bucket)
	if _, err := fresh.service.RestoreSetup(nil, location, fresh.secrets(), false); err != nil {
		t.Fatal(err)
	}

	if err := fresh.service.Abort(); err != nil {
		t.Fatal(err)
	}

	for _, path := range []string{installPath, fresh.paths.Local, "/var/lib/pupitre/restore.json"} {
		if _, held := fresh.fake.Files[path]; held {
			t.Fatalf("%s must be gone: the machine held nothing before", path)
		}
	}

	reverted := newBench(t, bucket).configured()
	reverted.install(map[string]any{"modules": []string{"core.system"}, "config": map[string]any{"core.system": map[string]any{"timezone": "Europe/Paris"}}})
	before := append([]byte(nil), reverted.fake.Files[installPath]...)

	if _, err := reverted.service.RestoreSetup(nil, location, reverted.secrets(), true); err != nil {
		t.Fatal(err)
	}

	if err := reverted.service.Abort(); err != nil {
		t.Fatal(err)
	}

	if !bytes.Equal(reverted.fake.Files[installPath], before) {
		t.Fatalf("the configuration of before must be back: %s", reverted.fake.Files[installPath])
	}
}

func TestWhatDoesNotMatchTheRecordIsRefusedBeforeAnythingIsWritten(t *testing.T) {
	bucket, source, made := backedUp(t)
	location := source.location()
	fresh := newBench(t, bucket)

	tampered := location
	tampered.SHA256 = strings.Repeat("0", 64)
	if _, err := fresh.service.RestoreSetup(nil, tampered, fresh.secrets(), false); refusalCode(err) != contract.ErrorBackupCorrupt {
		t.Fatalf("a manifest that is not the recorded one: %v", err)
	}

	gone := location
	gone.Key = strings.TrimSuffix(location.Key, made.ID) + "20200101T000000Z-000000"
	if _, err := fresh.service.Inspect(gone, fresh.secrets()); refusalCode(err) != contract.ErrorBackupMissing {
		t.Fatalf("a backup with no manifest: %v", err)
	}

	wrong := fresh.secrets()
	wrong.PrivateKey = otherPrivateKey
	if _, err := fresh.service.RestoreSetup(nil, location, wrong, false); refusalCode(err) != contract.ErrorBadRequest {
		t.Fatalf("a key that does not open the backup: %v", err)
	}

	if _, written := fresh.fake.Files[installPath]; written {
		t.Fatal("nothing may be written on a refusal")
	}
}

func TestAConfigurationFromANewerAgentIsRefused(t *testing.T) {
	bucket, source, made := backedUp(t)
	location := source.location()

	raw, _ := bucket.Object(made.Key + "/" + contract.BackupManifestKey)
	var manifest contract.BackupManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatal(err)
	}

	manifest.Server.ConfigRevision = 99
	rewritten, _ := json.Marshal(manifest)
	bucket.PutObject(made.Key+"/"+contract.BackupManifestKey, rewritten, source.now)
	location.SHA256 = ""

	fresh := newBench(t, bucket)
	if _, err := fresh.service.RestoreSetup(nil, location, fresh.secrets(), false); refusalCode(err) != contract.ErrorBackupUnsupported {
		t.Fatalf("got %v, want backup_unsupported", err)
	}
}

func TestAnAlteredPartFailsAloneAndTheOthersComeBack(t *testing.T) {
	bucket, source, made := backedUp(t)
	location := source.location()

	sealed, _ := bucket.Object(made.Key + "/path-notes.pupitre")
	altered := append([]byte(nil), sealed...)
	altered[len(altered)-1] ^= 1
	bucket.PutObject(made.Key+"/path-notes.pupitre", altered, source.now)

	fresh := newBench(t, bucket)
	if _, err := fresh.service.RestoreSetup(nil, location, fresh.secrets(), false); err != nil {
		t.Fatal(err)
	}

	data, err := fresh.service.RestoreData(nil, location, fresh.secrets(), []string{"path-notes.pupitre", "home.pupitre"}, false)
	if err != nil {
		t.Fatal(err)
	}

	if !slices.Equal(data.Failed, []string{"path-notes.pupitre"}) || !slices.Equal(data.Restored, []string{"home.pupitre"}) || len(data.Started) != 0 {
		t.Fatalf("data = %+v", data)
	}

	if _, err := os.Stat(filepath.Join(fresh.home, "notes")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("an altered part must never be opened")
	}
}

func TestAPartTheBackupDoesNotHoldIsRefused(t *testing.T) {
	bucket, source, _ := backedUp(t)
	fresh := newBench(t, bucket)

	_, err := fresh.service.RestoreData(nil, source.location(), fresh.secrets(), []string{"setup.pupitre"}, true)
	if refusalCode(err) != contract.ErrorBadRequest {
		t.Fatalf("got %v, want bad_request", err)
	}
}

func TestABucketReachedInClearOrByAStrangeNameIsRefused(t *testing.T) {
	bucket, source, _ := backedUp(t)
	fresh := newBench(t, bucket)
	asked := bucket.Calls("GetObject")

	for _, change := range []func(*contract.BackupLocation){
		func(location *contract.BackupLocation) {
			location.Endpoint = strings.Replace(location.Endpoint, "https://", "http://", 1)
		},
		func(location *contract.BackupLocation) { location.Bucket = "Not_A_Bucket" },
		func(location *contract.BackupLocation) { location.Region = "eu west" },
	} {
		location := source.location()
		change(&location)

		if _, err := fresh.service.Inspect(location, fresh.secrets()); refusalCode(err) != contract.ErrorBadRequest {
			t.Fatalf("%+v: got %v, want bad_request", location, err)
		}
	}

	if bucket.Calls("GetObject") != asked {
		t.Fatal("nothing may be asked of a bucket refused")
	}
}

func TestADeleteNamesABackupAndNothingElse(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()
	made := b.run(contract.BackupTriggerManual)

	for _, id := range []string{"", "../other-server", made.ID + "/..", "*"} {
		if _, err := b.service.Delete(id); refusalCode(err) != contract.ErrorBadRequest {
			t.Fatalf("%q: got %v, want bad_request", id, err)
		}
	}

	if !holds(bucket, made.ID) {
		t.Fatal("a refused delete removes nothing")
	}
}
