package lock_test

import (
	"path/filepath"
	"testing"
	"time"

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

// Hold waits its turn for a short while, which is what a read-then-write on a small file needs, and gives up past that.
func TestHoldWaitsForTheHolderThenGivesUp(t *testing.T) {
	path := filepath.Join(t.TempDir(), "projects.lock")

	release, held, err := lock.Acquire(path)
	if err != nil || !held {
		t.Fatalf("Acquire: held = %v, err = %v", held, err)
	}

	if _, err := lock.Hold(path, 50*time.Millisecond); err == nil {
		t.Fatal("Hold must give up on a lock nobody releases")
	}

	go func() {
		time.Sleep(30 * time.Millisecond)
		release()
	}()

	again, err := lock.Hold(path, time.Second)
	if err != nil {
		t.Fatalf("Hold after the release: %v", err)
	}

	again()

	none, err := lock.Hold("", time.Second)
	if err != nil {
		t.Fatalf("no path is no lock: %v", err)
	}

	none()
}
