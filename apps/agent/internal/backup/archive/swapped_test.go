package archive

import (
	"archive/tar"
	"bytes"
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

func swapped(t *testing.T, replace func(full string)) (string, os.FileInfo) {
	t.Helper()

	full := filepath.Join(t.TempDir(), "notes.txt")
	if err := os.WriteFile(full, []byte("seen by the walk"), 0o644); err != nil {
		t.Fatal(err)
	}

	walked, err := os.Lstat(full)
	if err != nil {
		t.Fatal(err)
	}

	replace(full)

	return full, walked
}

func removed(t *testing.T, full string) string {
	t.Helper()

	if err := os.Remove(full); err != nil {
		t.Fatal(err)
	}

	return full
}

func archived(t *testing.T, full string, walked os.FileInfo) []byte {
	t.Helper()

	var out bytes.Buffer
	written := make(chan error, 1)
	go func() { written <- writeFile(tar.NewWriter(&out), "notes.txt", full, walked) }()

	select {
	case err := <-written:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the archive waits on what it opened")
	}

	return out.Bytes()
}

func TestAFileSwappedForAPipeIsLeftOutWithoutWaitingOnIt(t *testing.T) {
	full, walked := swapped(t, func(full string) {
		if err := syscall.Mkfifo(removed(t, full), 0o644); err != nil {
			t.Fatal(err)
		}
	})

	if out := archived(t, full, walked); len(out) != 0 {
		t.Fatalf("a pipe went into the archive: %q", out)
	}
}

func TestAFileSwappedForALinkIsNeverFollowed(t *testing.T) {
	secret := filepath.Join(t.TempDir(), "shadow")
	if err := os.WriteFile(secret, []byte("root's own"), 0o600); err != nil {
		t.Fatal(err)
	}

	full, walked := swapped(t, func(full string) {
		if err := os.Symlink(secret, removed(t, full)); err != nil {
			t.Fatal(err)
		}
	})

	if out := archived(t, full, walked); bytes.Contains(out, []byte("root's own")) {
		t.Fatal("the archive followed a link planted after the walk")
	}
}

func TestAFileSwappedForAnotherIsLeftOut(t *testing.T) {
	full, walked := swapped(t, func(full string) {
		if err := os.WriteFile(full+".planted", []byte("planted after the walk"), 0o644); err != nil {
			t.Fatal(err)
		}

		if err := os.Rename(full+".planted", full); err != nil {
			t.Fatal(err)
		}
	})

	if out := archived(t, full, walked); len(out) != 0 {
		t.Fatalf("another file than the walk saw went in: %q", out)
	}
}
