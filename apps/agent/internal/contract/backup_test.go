package contract

import "testing"

const (
	sampleSHA       = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	sampleRecipient = "A10gydBSR5g4m/L8q8Msuz7sSJNSPyytp4QgelrXxEw="
	sampleSalt      = "lneDgZnxLTb17pcdSfaKvA=="
)

func sampleParts() []BackupPart {
	return []BackupPart{
		{Kind: BackupPartSetup, Key: "setup.pupitre", Bytes: 120, SHA256: sampleSHA, Fingerprint: sampleSHA},
		{Kind: BackupPartHome, Key: "home.pupitre", Bytes: 10, SHA256: sampleSHA, Paths: []string{".ssh", ".claude"}},
		{Kind: BackupPartDatabase, Key: "db-postgres-roles.pupitre", Bytes: 1, SHA256: sampleSHA, Engine: "postgres", Name: BackupWholeServer, Format: BackupDumpPgRoles},
		{Kind: BackupPartProject, Key: "project-intranet.pupitre", Bytes: 1, SHA256: sampleSHA, Name: "intranet", Mode: BackupProjectsFull, Git: &BackupGitState{Repo: "git@github.com:o/r.git", Branch: "main", Dirty: 2, Ahead: 1}},
		{Kind: BackupPartPath, Key: "path-notes.pupitre", Bytes: 1, SHA256: sampleSHA, Path: "notes"},
	}
}

func TestTheBackupConstantsComeFromTheSchema(t *testing.T) {
	if Backup.Format != 1 || Backup.Container.HeaderBytes != 52 || Backup.KDF.Iterations != 600_000 {
		t.Fatalf("constants = %+v", Backup)
	}

	for _, pattern := range []string{Backup.DatabaseItem, Backup.ProjectItem, Backup.EndpointPattern, Backup.BucketPattern, Backup.RegionPattern, Backup.NamePattern} {
		if pattern == "" {
			t.Fatalf("a pattern is missing: %+v", Backup)
		}
	}

	if len(Backup.ExcludedDirs) == 0 || len(Backup.HomePaths) == 0 || Backup.HomeExcluded[0] != ".ssh/authorized_keys" {
		t.Fatalf("lists = %+v", Backup)
	}
}

func TestTheBackupShapesValidateAgainstTheSchema(t *testing.T) {
	manifest := BackupManifest{
		Format:    1,
		ID:        "20260919T031500Z-7f3a2c",
		CreatedAt: "2026-09-19T03:15:00Z",
		Trigger:   BackupTriggerSchedule,
		Server:    BackupServer{ID: "srv_1", Hostname: "vps", Arch: "arm64", AgentVersion: "0.7.0", ConfigRevision: 6},
		Recipient: sampleRecipient,
		KDF:       BackupKDF{Alg: "pbkdf2-sha256", Iterations: 600_000, Salt: sampleSalt},
		Modules:   []string{"core.system"},
		Running:   []string{},
		Parts:     sampleParts(),
		Warnings:  []string{},
	}

	location := BackupLocation{Endpoint: "https://acc.r2.cloudflarestorage.com", Region: "auto", Bucket: "backups", Key: "pupitre/srv_1/20260919T031500Z-7f3a2c", PathStyle: true, SHA256: sampleSHA}

	cases := map[string]any{
		"BackupManifest": manifest,
		"BackupDeclaration": BackupDeclaration{
			ID: manifest.ID, CreatedAt: manifest.CreatedAt, Trigger: manifest.Trigger, Bytes: 133,
			Counts: CountsOf(manifest.Parts), ConfigRevision: 6, AgentVersion: "0.7.0",
			Recipient: sampleRecipient, KDFSalt: sampleSalt, Location: location,
		},
		"BackupBeat":               BackupBeat{IntervalHours: 24, LastRunAt: "2026-09-19T03:15:00Z"},
		"BackupStatusResult":       BackupStatusResult{Configured: true, IntervalHours: 24, Keep: 14, Last: &BackupLastRun{At: "2026-09-19T03:15:00Z", OK: true, ID: manifest.ID, Bytes: 133}},
		"BackupRunResult":          BackupRunResult{ID: manifest.ID, Key: location.Key, Bytes: 133, Parts: manifest.Parts, Warnings: []string{}, Declared: true},
		"BackupDeleteResult":       BackupDeleteResult{Deleted: true},
		"BackupRestoreSetupResult": BackupRestoreSetupResult{ID: manifest.ID, Modules: []string{}, Defer: []string{}, Extra: []string{}, Projects: []string{}, Dropped: []string{}, Parts: manifest.Parts[1:], Warnings: []string{}},
		"BackupRestoreDataResult":  BackupRestoreDataResult{Restored: []string{"home.pupitre"}, Failed: []string{}, Started: []string{}, Warnings: []string{}},
		"BackupSecrets":            BackupSecrets{AccessKeyID: "id", SecretAccessKey: "secret", PrivateKey: sampleRecipient},
		"BackupRestoreSetupParams": map[string]any{"location": location, "secrets_stdin": true},
		"BackupRestoreAbortResult": map[string]any{"done": true},
		"BackupInspectResult":      manifest,
		"BackupRestoreDataParams":  map[string]any{"location": location, "parts": []string{"home.pupitre"}, "secrets_stdin": true},
		"BackupRunParams":          map[string]any{"projects": BackupProjectsEnv},
		"BackupDeleteParams":       map[string]any{"id": manifest.ID},
		"BackupStatusParams":       map[string]any{},
		"BackupRestoreAbortParams": map[string]any{},
		"BackupInspectParams":      map[string]any{"location": location, "secrets_stdin": true},
		"BackupContentsParams":     map[string]any{},
		"BackupContentsResult": BackupContentsResult{
			Projects:   []BackupContentProject{{Name: "intranet", Repo: true, Included: true}},
			Databases:  []BackupContentDatabase{{Engine: "redis", Name: BackupWholeServer, Item: DatabaseItem("redis", BackupWholeServer), Included: false}},
			Unreadable: []string{"mysql"},
		},
	}

	excluded := manifest
	excluded.Excluded = &BackupExcluded{Projects: []string{"sketch"}, Databases: []string{DatabaseItem("postgres", "shop"), "redis:*"}}
	cases["BackupManifest"] = excluded

	for definition, value := range cases {
		if err := ValidateValue(definition, value); err != nil {
			t.Errorf("%s: %v", definition, err)
		}
	}
}

func TestCountsNameNothing(t *testing.T) {
	counts := CountsOf(sampleParts())

	if !counts.Setup || !counts.Home || counts.Databases != 1 || counts.Projects != 1 || counts.Paths != 1 {
		t.Fatalf("counts = %+v", counts)
	}
}
