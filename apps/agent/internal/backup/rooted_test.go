package backup_test

import (
	"os"
	"path/filepath"
	"slices"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/s3/s3test"
)

// A restore runs as root in dev's home: a folder dev turned into a link out of the home after the backup must not carry root's renames and removals outside.
func TestARestoreNeverWorksOutsideTheHomeThroughALinkPlantedSince(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()

	made := b.run(contract.BackupTriggerManual)
	if _, carried := partNamed(made.Parts, "project-intranet.pupitre"); !carried {
		t.Fatal("the project must be carried")
	}

	elsewhere := filepath.Join(t.TempDir(), "projects")
	behindALink(t, b.projects, elsewhere)
	victim := filepath.Join(elsewhere, projectName, "src", "a.ts")
	write(t, victim, "root's own file")

	data, err := b.service.RestoreData(nil, b.location(), b.secrets(), []string{"project-intranet.pupitre"}, false)
	if err != nil {
		t.Fatal(err)
	}

	if !slices.Contains(data.Failed, "project-intranet.pupitre") {
		t.Fatalf("a project behind a link out of the home must fail, not be restored there: %+v", data)
	}

	if got, err := os.ReadFile(victim); err != nil || string(got) != "root's own file" {
		t.Fatalf("what lies outside the home must be left alone: %q, %v", got, err)
	}

	entries, _ := os.ReadDir(elsewhere)
	if len(entries) != 1 {
		t.Fatalf("nothing may be staged outside the home: %v", entries)
	}
}
