package backup_test

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/s3/s3test"
)

// behindALink moves a folder to where and leaves a link to it in its place.
func behindALink(t *testing.T, folder, where string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(where), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.Rename(folder, where); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink(where, folder); err != nil {
		t.Fatal(err)
	}
}

func isLink(t *testing.T, path string) bool {
	t.Helper()

	info, err := os.Lstat(path)

	return err == nil && info.Mode()&os.ModeSymlink != 0
}

func TestAProjectAndAPathThatAreLinksAreCarriedAndComeBackThroughThem(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()

	project := filepath.Join(b.projects, projectName)
	realProject := filepath.Join(b.home, "work", projectName)
	notes := filepath.Join(b.home, "notes")
	realNotes := filepath.Join(b.home, "archive", "notes")
	behindALink(t, project, realProject)
	behindALink(t, notes, realNotes)

	made := b.run(contract.BackupTriggerManual)
	if len(made.Warnings) != 0 {
		t.Fatalf("warnings = %v", made.Warnings)
	}

	carried := names(opened(t, bucket, made.Key+"/project-intranet.pupitre"))
	if !slices.Contains(carried, "src/a.ts") || !slices.Contains(carried, ".env.local") {
		t.Fatalf("the project must be carried from where its link leads: %v", carried)
	}

	if carried := names(opened(t, bucket, made.Key+"/path-notes.pupitre")); !slices.Contains(carried, "notes/todo.md") {
		t.Fatalf("the notes must be carried from where their link leads: %v", carried)
	}

	for _, lost := range []string{filepath.Join(realProject, "src/a.ts"), filepath.Join(realNotes, "todo.md")} {
		if err := os.Remove(lost); err != nil {
			t.Fatal(err)
		}
	}

	data, err := b.service.RestoreData(nil, b.location(), b.secrets(), []string{"project-intranet.pupitre", "path-notes.pupitre"}, false)
	if err != nil {
		t.Fatal(err)
	}

	if len(data.Failed) != 0 {
		t.Fatalf("data = %+v", data)
	}

	if !isLink(t, project) || !isLink(t, notes) {
		t.Fatal("a restore goes through the link, it never replaces it")
	}

	for path, want := range map[string]string{
		filepath.Join(realProject, "src/a.ts"):   "export const a = 1",
		filepath.Join(realProject, ".env.local"): "SECRET=1",
		filepath.Join(realNotes, "todo.md"):      "- restore everything",
	} {
		if got, err := os.ReadFile(path); err != nil || string(got) != want {
			t.Fatalf("%s = %q, %v", path, got, err)
		}
	}
}

func TestAFolderThatLeadsOutOfTheHomeIsAWarningNotAnEmptyPart(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()

	behindALink(t, filepath.Join(b.projects, projectName), filepath.Join(t.TempDir(), projectName))
	behindALink(t, filepath.Join(b.home, "notes"), filepath.Join(t.TempDir(), "notes"))

	made := b.run(contract.BackupTriggerManual)

	for _, key := range []string{"project-intranet.pupitre", "path-notes.pupitre"} {
		if _, carried := partNamed(made.Parts, key); carried {
			t.Fatalf("%s must not be carried from outside the home", key)
		}
	}

	if _, carried := partNamed(made.Parts, "home.pupitre"); !carried {
		t.Fatal("the other parts go on")
	}

	joined := strings.Join(made.Warnings, "\n")
	if len(made.Warnings) != 2 || !strings.Contains(joined, projectName) || !strings.Contains(joined, "notes") {
		t.Fatalf("each folder left out is said: %v", made.Warnings)
	}
}
