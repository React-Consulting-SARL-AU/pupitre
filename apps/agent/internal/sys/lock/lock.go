// Package lock holds one file lock, shared by everything on the machine that
// must not run twice at once: an install, and the configuration migration that
// has to happen before one.
package lock

import (
	"errors"
	"os"
	"path/filepath"
	"syscall"
	"time"
)

// ErrHeld is a lock still held once the wait is over.
var ErrHeld = errors.New("lock held by another process")

const holdPoll = 20 * time.Millisecond

// Acquire takes the lock without waiting. It answers held=false when another
// process holds it, rather than blocking: a caller that cannot get in has
// something to say to whoever asked, and a caller that only reads has a fast
// path that never asks at all.
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

// Hold takes the lock, waiting for whoever holds it up to wait: what a
// read-then-write on a small file needs, where the holder is gone in
// milliseconds and a wait without end would be a stuck command.
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
