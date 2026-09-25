package lock

import (
	"errors"
	"os"
	"path/filepath"
	"syscall"
	"time"
)

var ErrHeld = errors.New("lock held by another process")

const holdPoll = 20 * time.Millisecond

// Never blocks: a caller shut out has something to tell whoever asked.
func Acquire(path string) (release func(), held bool, err error) {
	if path == "" {
		return func() {}, true, nil
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, false, err
	}

	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, false, err
	}

	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = file.Close()

		if errors.Is(err, syscall.EWOULDBLOCK) {
			return nil, false, nil
		}

		return nil, false, err
	}

	return func() {
		_ = syscall.Flock(int(file.Fd()), syscall.LOCK_UN)
		_ = file.Close()
	}, true, nil
}

// A bounded wait, for a read-then-write on a small file whose holder is gone in milliseconds.
func Hold(path string, wait time.Duration) (release func(), err error) {
	deadline := time.Now().Add(wait)

	for {
		release, held, err := Acquire(path)
		if err != nil {
			return nil, err
		}

		if held {
			return release, nil
		}

		if time.Now().After(deadline) {
			return nil, ErrHeld
		}

		time.Sleep(holdPoll)
	}
}
