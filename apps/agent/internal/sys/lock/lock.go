// Package lock holds one file lock, shared by everything on the machine that
// must not run twice at once: an install, and the configuration migration that
// has to happen before one.
package lock

import (
	"errors"
	"os"
	"path/filepath"
	"syscall"
)

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
