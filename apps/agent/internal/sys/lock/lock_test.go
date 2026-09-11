package lock_test

import (
	"path/filepath"
	"testing"

	"pupitre.studio/agent/internal/sys/lock"
)

func TestOneHolderAtATime(t *testing.T) {
	path := filepath.Join(t.TempDir(), "install.lock")

	release, held, err := lock.Acquire(path)
	if err != nil || !held {
		t.Fatalf("Acquire: held = %v, err = %v", held, err)
	}

	_, second, err := lock.Acquire(path)
	if err != nil {
		t.Fatalf("Acquire: %v", err)
	}

	if second {
		t.Fatal("two holders of the same lock at once")
	}

	release()

	again, held, err := lock.Acquire(path)
	if err != nil || !held {
		t.Fatalf("Acquire after release: held = %v, err = %v", held, err)
	}

	again()
}

// No path is no lock: the tests take it, and nothing else does.
func TestNoPathIsNoLock(t *testing.T) {
	release, held, err := lock.Acquire("")
	if err != nil || !held {
		t.Fatalf("Acquire: held = %v, err = %v", held, err)
	}

	release()
}
