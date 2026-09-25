package archive

import (
	"archive/tar"
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func openRoot(t *testing.T, dir string) *os.Root {
	t.Helper()

	scoped, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { scoped.Close() })

	return scoped
}

// A restore runs as root in dev's home: every step of a swap is taken under the home, so a folder dev turned into a link out of it is refused.
func TestSwapStaysUnderItsRootWhenAFolderOnTheWayIsALink(t *testing.T) {
	home := t.TempDir()
	outside := t.TempDir()
	write(t, outside, "profile.d/keep.sh", "root's own")

	if err := os.Symlink(outside, filepath.Join(home, "etc")); err != nil {
		t.Fatal(err)
	}

	scoped := openRoot(t, home)

	staged, err := Staging(scoped, ".", "path", Unchanged)
	if err != nil {
		t.Fatal(err)
	}
	write(t, filepath.Join(home, staged), "profile.d/evil.sh", "planted")

	if err := Swap(scoped, filepath.Join(staged, "profile.d"), "etc/profile.d"); err == nil {
		t.Fatal("a swap must not go through a link out of its root")
	}

	if _, err := os.Stat(filepath.Join(outside, "profile.d", "evil.sh")); err == nil {
		t.Fatal("nothing may land where the link leads")
	}

	if got, err := os.ReadFile(filepath.Join(outside, "profile.d", "keep.sh")); err != nil || string(got) != "root's own" {
		t.Fatalf("what lies outside must be left alone: %q, %v", got, err)
	}

	if _, err := Staging(scoped, "etc", "project", Unchanged); err == nil {
		t.Fatal("a staging folder must not be made through a link out of its root")
	}
}

// The staging folder is dev's: swapped for a link out of the home after it was made, it must not take the extraction with it.
func TestExtractInRefusesAStagingFolderSwappedForALink(t *testing.T) {
	home := t.TempDir()
	outside := t.TempDir()
	scoped := openRoot(t, home)

	staged, err := Staging(scoped, ".", "path", Unchanged)
	if err != nil {
		t.Fatal(err)
	}

	if err := os.Remove(filepath.Join(home, staged)); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink(outside, filepath.Join(home, staged)); err != nil {
		t.Fatal(err)
	}

	var archived bytes.Buffer
	writer := tar.NewWriter(&archived)
	writer.WriteHeader(&tar.Header{Name: "cron.d/evil", Typeflag: tar.TypeReg, Mode: 0o644, Size: 7})
	writer.Write([]byte("planted"))
	writer.Close()

	if err := ExtractIn(&archived, scoped, staged, Unchanged); err == nil {
		t.Fatal("a staging folder turned into a link out of the root must be refused")
	}

	if entries, _ := os.ReadDir(outside); len(entries) != 0 {
		t.Fatalf("nothing may land where the link leads: %v", entries)
	}
}
