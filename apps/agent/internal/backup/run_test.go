package backup_test

import (
	"archive/tar"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"slices"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/backup"
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/s3/s3test"
)

func names(plain []byte) []string {
	var listed []string

	reader := tar.NewReader(bytes.NewReader(plain))

	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			return listed
		}

		if err != nil {
			return listed
		}

		listed = append(listed, header.Name)
	}
}

func TestABackupCarriesEveryPartSealedForTheRecipient(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()

	result := b.run(contract.BackupTriggerManual)

	want := []string{"setup.pupitre", "home.pupitre", "db-postgres-roles.pupitre", "db-postgres-shop.pupitre", "db-redis.pupitre", "project-intranet.pupitre", "path-notes.pupitre"}
	var got []string

	for _, part := range result.Parts {
		got = append(got, part.Key)
	}

	if !slices.Equal(got, want) {
		t.Fatalf("parts = %v, want %v (warnings %v)", got, want, result.Warnings)
	}

	if !result.Declared || len(result.Warnings) != 0 || !strings.HasPrefix(result.Key, "pupitre/"+serverID+"/") {
		t.Fatalf("result = %+v", result)
	}

	for _, part := range result.Parts {
		sealed, _ := bucket.Object(result.Key + "/" + part.Key)
		sum := sha256.Sum256(sealed)
		if hex.EncodeToString(sum[:]) != part.SHA256 || int64(len(sealed)) != part.Bytes {
			t.Fatalf("%s: the manifest does not bind the object", part.Key)
		}
	}

	if string(opened(t, bucket, result.Key+"/db-postgres-shop.pupitre")) != pgDump {
		t.Fatal("the dump must travel as pg_dump wrote it")
	}

	if string(opened(t, bucket, result.Key+"/db-redis.pupitre")) != redisSnapshot || string(opened(t, bucket, result.Key+"/db-postgres-roles.pupitre")) != pgRoles {
		t.Fatal("the whole-server parts must travel as their engines wrote them")
	}

	setup := names(opened(t, bucket, result.Key+"/setup.pupitre"))
	for _, name := range []string{"etc/pupitre/install.json", "etc/pupitre/projects.local.json", "etc/pupitre/migrations.json", "etc/pupitre/env", "var/lib/pupitre/projects.running.json"} {
		if !slices.Contains(setup, name) {
			t.Fatalf("setup lacks %s: %v", name, setup)
		}
	}

	home := names(opened(t, bucket, result.Key+"/home.pupitre"))
	if !slices.Contains(home, ".ssh/id_ed25519") || slices.Contains(home, ".ssh/authorized_keys") || !slices.Contains(home, ".claude.json") ||
		!slices.Contains(home, ".claude/settings.json") || slices.ContainsFunc(home, func(name string) bool { return strings.HasPrefix(name, ".claude/remote") }) {
		t.Fatalf("home = %v", home)
	}

	project := names(opened(t, bucket, result.Key+"/project-intranet.pupitre"))
	if !slices.Contains(project, ".git/HEAD") || !slices.Contains(project, ".env.local") || slices.ContainsFunc(project, func(name string) bool { return strings.Contains(name, "node_modules") }) {
		t.Fatalf("project = %v", project)
	}

	part, _ := partNamed(result.Parts, "project-intranet.pupitre")
	if part.Git == nil || part.Git.Branch != "feature" || part.Git.Dirty != 2 || part.Git.Ahead != 2 || part.Git.Repo != projectRepo || part.Mode != contract.BackupProjectsFull {
		t.Fatalf("project part = %+v, git %+v", part, part.Git)
	}
}

func TestTheManifestIsWrittenLastAndDeclaredWithItsDigest(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()

	result := b.run(contract.BackupTriggerSchedule)

	raw, found := bucket.Object(result.Key + "/" + contract.BackupManifestKey)
	if !found {
		t.Fatal("no manifest")
	}

	var manifest contract.BackupManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatal(err)
	}

	if err := contract.ValidateValue("BackupManifest", manifest); err != nil {
		t.Fatal(err)
	}

	if manifest.Recipient != recipient || manifest.KDF.Salt != salt || manifest.Server.ID != serverID || manifest.Server.ConfigRevision != 5 || !slices.Equal(manifest.Running, []string{projectName}) {
		t.Fatalf("manifest = %+v", manifest)
	}

	declared := b.platform.declarations()
	sum := sha256.Sum256(raw)
	if len(declared) != 1 || declared[0].Location.SHA256 != hex.EncodeToString(sum[:]) || declared[0].Counts.Databases != 3 || declared[0].Trigger != contract.BackupTriggerSchedule {
		t.Fatalf("declared = %+v", declared)
	}

	if err := contract.ValidateValue("BackupDeclaration", declared[0]); err != nil {
		t.Fatal(err)
	}

	encoded, _ := json.Marshal(declared[0])
	if strings.Contains(string(encoded), projectName) || strings.Contains(string(encoded), "shop") {
		t.Fatalf("the platform must learn no name: %s", encoded)
	}
}

func TestNoSecretReachesTheJournal(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()

	b.run(contract.BackupTriggerManual)

	journal, err := os.ReadFile(b.logPath)
	if err != nil {
		t.Fatal(err)
	}

	for _, secret := range []string{secretKey, redisPassword} {
		if strings.Contains(string(journal), secret) {
			t.Fatalf("a secret reached the journal:\n%s", journal)
		}
	}
}

func TestANextBackupCopiesInsideTheBucketWhatDidNotChange(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()

	first := b.run(contract.BackupTriggerManual)
	b.now = b.now.Add(time.Hour)
	second := b.run(contract.BackupTriggerManual)

	if bucket.Calls("CopyObject") < 2 {
		t.Fatalf("the unchanged tree parts must be copied, %d copies", bucket.Calls("CopyObject"))
	}

	for _, key := range []string{"project-intranet.pupitre", "path-notes.pupitre", "home.pupitre"} {
		before, _ := partNamed(first.Parts, key)
		after, _ := partNamed(second.Parts, key)
		if before.SHA256 != after.SHA256 || before.Fingerprint == "" {
			t.Fatalf("%s: a copy is the same object", key)
		}
	}

	if _, found := bucket.Object(second.Key + "/project-intranet.pupitre"); !found {
		t.Fatal("the copy must stand under the new backup")
	}
}

func TestAFailedDatabaseIsAWarningAndTheBackupGoesOn(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()
	delete(b.fake.Answers, "pg_dump --format=custom --dbname=shop")
	b.fake.Refuse("pg_dump --format=custom --dbname=shop", "")

	result := b.run(contract.BackupTriggerManual)

	if _, found := partNamed(result.Parts, "db-postgres-shop.pupitre"); found {
		t.Fatal("a failed dump must not be in the manifest")
	}

	if len(result.Warnings) != 1 || !strings.Contains(result.Warnings[0], "db:postgres:shop") {
		t.Fatalf("warnings = %v", result.Warnings)
	}

	if _, found := partNamed(result.Parts, "project-intranet.pupitre"); !found || bucket.OpenUploads() != 0 {
		t.Fatal("the other parts go on, and no upload stays open")
	}

	status, err := b.service.Status()
	if err != nil || status.Last == nil || !status.Last.OK || len(status.Last.Warnings) != 1 {
		t.Fatalf("the status says the backup exists and what it lacks: %+v, %v", status.Last, err)
	}

	if beat := b.service.Beat(); beat == nil || beat.LastWarnings != 1 {
		t.Fatalf("the heartbeat counts what the last backup lacks: %+v", beat)
	}
}

func TestABucketThatRefusesTheSetupStopsTheBackup(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()
	bucket.Refuse("PutObject", http.StatusForbidden, "AccessDenied")

	_, err := b.service.Run(nil, contract.BackupTriggerManual, backup.Overrides{})

	var refusal *protocol.Error
	if !errors.As(err, &refusal) || refusal.Code != contract.ErrorStorageRefused || refusal.Fix == "" {
		t.Fatalf("got %v, want storage_refused", err)
	}

	for _, key := range bucket.Keys() {
		if strings.HasSuffix(key, contract.BackupManifestKey) {
			t.Fatal("a backup without its configuration writes no manifest")
		}
	}

	status, err := b.service.Status()
	if err != nil || status.Last == nil || status.Last.OK || status.Last.Error == "" {
		t.Fatalf("status = %+v, %v", status, err)
	}
}

func TestAnUnconfiguredServerRefusesToBackUp(t *testing.T) {
	b := newBench(t, s3test.New(t, bucketName))

	_, err := b.service.Run(nil, contract.BackupTriggerManual, backup.Overrides{})

	var refusal *protocol.Error
	if !errors.As(err, &refusal) || refusal.Code != contract.ErrorModuleNotFound {
		t.Fatalf("got %v, want module_not_found", err)
	}
}

func TestOverridesLeaveOutWhatTheReaderAsks(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()

	without := false
	result, err := b.service.Run(nil, contract.BackupTriggerManual, backup.Overrides{Databases: &without, Projects: contract.BackupProjectsEnv})
	if err != nil {
		t.Fatal(err)
	}

	for _, part := range result.Parts {
		if part.Kind == contract.BackupPartDatabase {
			t.Fatalf("no database was asked for: %s", part.Key)
		}
	}

	part, _ := partNamed(result.Parts, "project-intranet.pupitre")
	if part.Mode != contract.BackupProjectsEnv {
		t.Fatalf("project part = %+v", part)
	}
}

func TestAnEnvProjectCarriesOnlyWhatGitIgnores(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()
	b.fake.Answer("check-ignore", ".env.local\n")

	result, err := b.service.Run(nil, contract.BackupTriggerManual, backup.Overrides{Projects: contract.BackupProjectsEnv})
	if err != nil {
		t.Fatal(err)
	}

	if listed := names(opened(t, bucket, result.Key+"/project-intranet.pupitre")); !slices.Equal(listed, []string{".env.local"}) {
		t.Fatalf("env part = %v", listed)
	}
}

func TestAPlatformThatDoesNotAnswerLeavesADeclarationForTheDaemon(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()
	b.platform.down = true

	result := b.run(contract.BackupTriggerManual)
	if result.Declared {
		t.Fatal("an unanswered declaration is not declared")
	}

	b.platform.down = false
	b.service.Tend()

	if declared := b.platform.declarations(); len(declared) != 1 || declared[0].ID != result.ID {
		t.Fatalf("the pending declaration is the backup's: %+v", declared)
	}

	b.service.Tend()
	if len(b.platform.declarations()) != 1 {
		t.Fatal("a declaration goes out once")
	}
}
