package sys

import (
	"errors"
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

func TestRealReadFileInRefusesAPipeWithoutWaitingOnIt(t *testing.T) {
	root := t.TempDir()
	if err := syscall.Mkfifo(filepath.Join(root, "pipe"), 0o644); err != nil {
		t.Fatal(err)
	}

	read := make(chan error, 1)
	go func() {
		_, err := Real{}.ReadFileIn(root, "pipe")
		read <- err
	}()

	select {
	case err := <-read:
		if !errors.Is(err, ErrNotRegular) {
			t.Fatalf("got %v, want a refusal of what is not a file", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the read waits on a pipe nobody writes into")
	}
}

func TestRealReadFileInStillReadsAFile(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "notes.md"), []byte("# notes\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	content, err := Real{}.ReadFileIn(root, "notes.md")
	if err != nil || string(content) != "# notes\n" {
		t.Fatalf("content %q, %v", content, err)
	}
}
