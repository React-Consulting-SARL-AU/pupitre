package backup_test

import (
	"encoding/json"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/backup"
	"pupitre.studio/agent/internal/contract"
	module "pupitre.studio/agent/internal/modules/core/backup"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/s3/s3test"
)

const sketch = `{"name":"sketch","dir":"sketch","boot":false,"runtimes":{},"processes":[{"id":"app","dir":".","pkgmgr":"bun","host":"127.0.0.1","port":3001,"routes":[],"cmd":"bun run dev"}]}`

func (b *bench) setting(key string, value any) {
	b.t.Helper()

	var document map[string]any

	if err := json.Unmarshal(b.fake.Files[installPath], &document); err != nil {
		b.t.Fatal(err)
	}

	document["config"].(map[string]any)[module.ID].(map[string]any)[key] = value
	b.install(document)
}

func (b *bench) withSketch() {
	b.t.Helper()

	var registry struct {
		Projects []json.RawMessage `json:"projects"`
	}

	if err := json.Unmarshal(b.fake.Files[b.paths.Local], &registry); err != nil {
		b.t.Fatal(err)
	}

	registry.Projects = append(registry.Projects, json.RawMessage(sketch))
	encoded, _ := json.Marshal(registry)
	b.fake.Files[b.paths.Local] = encoded

	write(b.t, filepath.Join(b.projects, "sketch", "draft.md"), "a sketch")
}

func TestWhatTheSettingsLeaveOutStaysOutAndIsRecorded(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()
	b.withSketch()
	b.setting("exclude_projects", []string{"sketch", "gone"})
	b.setting("exclude_databases", []string{"postgres:shop", "redis:*", "mysql:absent"})

	result := b.run(contract.BackupTriggerManual)

	keys := keys(result.Parts)

	for _, left := range []string{"project-sketch.pupitre", "db-postgres-shop.pupitre", "db-postgres-roles.pupitre", "db-redis.pupitre"} {
		if slices.Contains(keys, left) {
			t.Fatalf("%s must stay out: %v", left, keys)
		}
	}

	if !slices.Contains(keys, "project-intranet.pupitre") {
		t.Fatalf("what is not excluded goes: %v", keys)
	}

	raw, _ := bucket.Object(result.Key + "/" + contract.BackupManifestKey)

	var manifest contract.BackupManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatal(err)
	}

	if manifest.Excluded == nil || !slices.Equal(manifest.Excluded.Projects, []string{"sketch"}) || !slices.Equal(manifest.Excluded.Databases, []string{"postgres:shop", "redis:*"}) {
		t.Fatalf("excluded = %+v: only what the server holds is recorded", manifest.Excluded)
	}

	if err := contract.ValidateValue("BackupManifest", manifest); err != nil {
		t.Fatal(err)
	}
}

func TestTheRolesGoWithTheirEngineAsLongAsOneDatabaseDoes(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()
	b.fake.Answer("FROM pg_database WHERE datallowconn", "shop\nflyleaf\n")
	b.fake.Answer("pg_dump --format=custom --dbname=flyleaf", "PGDMP flyleaf")
	b.setting("exclude_databases", []string{"postgres:shop"})

	keys := keys(b.run(contract.BackupTriggerManual).Parts)
	if !slices.Contains(keys, "db-postgres-roles.pupitre") || !slices.Contains(keys, "db-postgres-flyleaf.pupitre") || slices.Contains(keys, "db-postgres-shop.pupitre") {
		t.Fatalf("parts = %v", keys)
	}
}

func TestTheContentsAreTheChecklistTheAppDraws(t *testing.T) {
	b := newBench(t, s3test.New(t, bucketName)).configured()
	b.withSketch()
	b.setting("exclude_projects", []string{"sketch"})
	b.setting("exclude_databases", []string{"redis:*"})

	contents, err := b.service.Contents()
	if err != nil {
		t.Fatal(err)
	}

	want := []contract.BackupContentProject{{Name: projectName, Repo: true, Included: true}, {Name: "sketch", Repo: false, Included: false}}
	if !slices.Equal(contents.Projects, want) {
		t.Fatalf("projects = %+v", contents.Projects)
	}

	wantDatabases := []contract.BackupContentDatabase{
		{Engine: "postgres", Name: "shop", Item: "postgres:shop", Included: true},
		{Engine: "redis", Name: "*", Item: "redis:*", Included: false},
	}

	if !slices.Equal(contents.Databases, wantDatabases) || len(contents.Unreadable) != 0 {
		t.Fatalf("databases = %+v, unreadable %v", contents.Databases, contents.Unreadable)
	}

	if err := contract.ValidateValue("BackupContentsResult", contents); err != nil {
		t.Fatal(err)
	}
}

func TestAnEngineThatDoesNotAnswerIsNamedAndTheRestIsListed(t *testing.T) {
	b := newBench(t, s3test.New(t, bucketName)).configured()
	delete(b.fake.Answers, "FROM pg_database")
	b.fake.Refuse("FROM pg_database", "")

	contents, err := b.service.Contents()
	if err != nil || !slices.Equal(contents.Unreadable, []string{"postgres"}) || len(contents.Databases) != 1 || contents.Databases[0].Item != "redis:*" {
		t.Fatalf("contents = %+v, %v", contents, err)
	}
}

func TestWithoutTheModuleEverythingIsIncluded(t *testing.T) {
	b := newBench(t, s3test.New(t, bucketName)).configured()
	b.install(map[string]any{"modules": []string{"core.system", "db.postgres"}})

	contents, err := b.service.Contents()
	if err != nil || len(contents.Projects) != 1 || !contents.Projects[0].Included || len(contents.Databases) != 1 || !contents.Databases[0].Included {
		t.Fatalf("contents = %+v, %v", contents, err)
	}
}

func excludingBackup(t *testing.T) (*s3test.Fake, *bench, contract.BackupRunResult) {
	t.Helper()

	bucket := s3test.New(t, bucketName)
	source := newBench(t, bucket).configured()
	source.withSketch()
	source.setting("exclude_projects", []string{projectName, "sketch"})
	source.setting("exclude_databases", []string{"postgres:shop"})

	return bucket, source, source.run(contract.BackupTriggerManual)
}

func TestAFreshServerClonesAnExcludedProjectAndDropsOneWithoutRepository(t *testing.T) {
	bucket, source, _ := excludingBackup(t)
	location := source.location()

	fresh := newBench(t, bucket)

	setup, err := fresh.service.RestoreSetup(nil, location, fresh.secrets(), false)
	if err != nil {
		t.Fatal(err)
	}

	fresh.fake.Packages["postgresql-17"] = "17.2"
	fresh.fake.Packages["redis-server"] = "7.0.15"
	fresh.fake.Units["redis-server"] = modtest.UnitActive
	fresh.fake.Dirs[filepath.Join(fresh.projects, projectName)] = true

	data, err := fresh.service.RestoreData(nil, location, fresh.secrets(), keys(setup.Parts), true)
	if err != nil {
		t.Fatal(err)
	}

	commands := strings.Join(fresh.fake.Commands(), "\n")
	if !strings.Contains(commands, "clone") || !strings.Contains(commands, projectRepo) || !strings.Contains(commands, "bun install") || strings.Contains(commands, "pg_restore") {
		t.Fatalf("the excluded project is cloned and installed, the excluded database never made:\n%s", commands)
	}

	if !slices.Equal(data.Started, []string{projectName}) || len(data.Failed) != 0 {
		t.Fatalf("data = %+v", data)
	}

	said := strings.Join(data.Warnings, "\n")
	for _, name := range []string{projectName, "sketch", "postgres:shop"} {
		if !strings.Contains(said, name) {
			t.Fatalf("warnings must name %s: %v", name, data.Warnings)
		}
	}

	if strings.Contains(string(fresh.fake.Files[fresh.paths.Local]), "sketch") {
		t.Fatal("a project nothing can bring back leaves the registry")
	}
}

func TestARevertLeavesWhatWasExcludedAsItIs(t *testing.T) {
	bucket, source, _ := excludingBackup(t)
	location := source.location()

	reverted := newBench(t, bucket).configured()
	reverted.withSketch()

	setup, err := reverted.service.RestoreSetup(nil, location, reverted.secrets(), true)
	if err != nil {
		t.Fatal(err)
	}

	if len(setup.Dropped) != 0 || !slices.Contains(setup.Projects, "sketch") {
		t.Fatalf("an excluded project is in the backup's registry and is never dropped: %+v", setup)
	}

	reverted.fake.Units["redis-server"] = modtest.UnitActive

	data, err := reverted.service.RestoreData(nil, location, reverted.secrets(), keys(setup.Parts), false)
	if err != nil {
		t.Fatal(err)
	}

	if strings.Contains(strings.Join(reverted.fake.Commands(), "\n"), "clone") || !strings.Contains(string(reverted.fake.Files[reverted.paths.Local]), "sketch") || len(data.Warnings) != 0 {
		t.Fatalf("nothing excluded is touched on a revert: %+v", data)
	}
}

func manifestOf(t *testing.T, bucket *s3test.Fake, key string) contract.BackupManifest {
	t.Helper()

	raw, _ := bucket.Object(key + "/" + contract.BackupManifestKey)

	var manifest contract.BackupManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatal(err)
	}

	return manifest
}

func TestACategorySwitchedOffLeavesOutAndRecordsEverythingInIt(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()
	b.withSketch()
	b.setting("projects", false)
	b.setting("databases", false)

	manifest := manifestOf(t, bucket, b.run(contract.BackupTriggerManual).Key)
	if !slices.Equal(manifest.Excluded.Projects, []string{projectName, "sketch"}) || !slices.Equal(manifest.Excluded.Databases, []string{"postgres:shop", "redis:*"}) {
		t.Fatalf("excluded = %+v", manifest.Excluded)
	}

	for _, part := range manifest.Parts {
		if part.Kind == contract.BackupPartProject || part.Kind == contract.BackupPartDatabase {
			t.Fatalf("%s must stay out", part.Key)
		}
	}

	b.setting("projects", true)
	b.now = b.now.Add(time.Hour)

	result, err := b.service.Run(nil, contract.BackupTriggerManual, backup.Overrides{Projects: contract.BackupProjectsNone})
	if err != nil {
		t.Fatal(err)
	}

	if excluded := manifestOf(t, bucket, result.Key).Excluded; !slices.Equal(excluded.Projects, []string{projectName, "sketch"}) {
		t.Fatalf("an override of none leaves every project out too: %+v", excluded)
	}
}

func TestAFreshRestoreOfABackupWithoutCategoriesLeavesNoProjectWithoutAFolder(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	source := newBench(t, bucket).configured()
	source.withSketch()
	source.setting("projects", false)
	source.setting("databases", false)
	source.run(contract.BackupTriggerManual)
	location := source.location()

	fresh := newBench(t, bucket)

	setup, err := fresh.service.RestoreSetup(nil, location, fresh.secrets(), false)
	if err != nil {
		t.Fatal(err)
	}

	fresh.fake.Dirs[filepath.Join(fresh.projects, projectName)] = true

	data, err := fresh.service.RestoreData(nil, location, fresh.secrets(), keys(setup.Parts), true)
	if err != nil {
		t.Fatal(err)
	}

	commands := strings.Join(fresh.fake.Commands(), "\n")
	if !strings.Contains(commands, "clone") || strings.Contains(commands, "pg_restore") || strings.Contains(commands, "dump.rdb") {
		t.Fatalf("the projects are cloned, no database is made:\n%s", commands)
	}

	if strings.Contains(string(fresh.fake.Files[fresh.paths.Local]), "sketch") || !slices.Equal(data.Started, []string{projectName}) {
		t.Fatalf("no project stays without a folder: %+v", data)
	}

	said := strings.Join(data.Warnings, "\n")
	for _, name := range []string{projectName, "sketch", "postgres:shop", "redis:*"} {
		if !strings.Contains(said, name) {
			t.Fatalf("warnings must name %s: %v", name, data.Warnings)
		}
	}
}
