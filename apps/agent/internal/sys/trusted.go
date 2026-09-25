package sys

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

var (
	errUntrustedLink = errors.New("link another account could have planted")
	errChanged       = errors.New("changed while it was opened")
)

const separator = string(filepath.Separator)

// openDir resolves a folder one component at a time, following a link only when root owns it and its folder, so no other account can plant or swap it.
func openDir(path string) (*os.Root, error) {
	current, err := os.OpenRoot(separator)
	if err != nil {
		return nil, err
	}

	reached := separator
	pending := components(path)
	hops := 0

	for len(pending) > 0 {
		name := pending[0]
		pending = pending[1:]

		info, err := current.Lstat(name)
		if err != nil {
			current.Close()

			return nil, &fs.PathError{Op: "open", Path: filepath.Join(reached, name), Err: unwrapped(err)}
		}

		if info.Mode()&fs.ModeSymlink != 0 {
			target, err := trustedTarget(current, name, info, &hops)
			current.Close()
			if err != nil {
				return nil, &fs.PathError{Op: "open", Path: filepath.Join(reached, name), Err: err}
			}

			if !filepath.IsAbs(target) {
				target = filepath.Join(reached, target)
			}

			pending = append(components(target), pending...)
			reached = separator

			if current, err = os.OpenRoot(separator); err != nil {
				return nil, err
			}

			continue
		}

		next, err := enter(current, name, info)
		current.Close()
		if err != nil {
			return nil, &fs.PathError{Op: "open", Path: filepath.Join(reached, name), Err: err}
		}

		current = next
		reached = filepath.Join(reached, name)
	}

	return current, nil
}

func trustedTarget(dir *os.Root, name string, link fs.FileInfo, hops *int) (string, error) {
	if *hops++; *hops > maxLinkHops {
		return "", syscall.ELOOP
	}

	if !heldByRoot(dir, link) {
		return "", errUntrustedLink
	}

	return dir.Readlink(name)
}

// enter opens a folder seen by Lstat and checks it is the one opened: a link swapped in between is refused, never followed.
func enter(current *os.Root, name string, seen fs.FileInfo) (*os.Root, error) {
	if !seen.IsDir() {
		return nil, syscall.ENOTDIR
	}

	next, err := current.OpenRoot(name)
	if err != nil {
		return nil, unwrapped(err)
	}

	opened, err := next.Stat(".")
	if err != nil || !os.SameFile(seen, opened) {
		next.Close()

		return nil, errChanged
	}

	return next, nil
}

// A link is root's when root owns it and the folder it sits in, which no other account can write, or only in its own entries.
func heldByRoot(dir *os.Root, link fs.FileInfo) bool {
	if uidOf(link) != 0 {
		return false
	}

	folder, err := dir.Stat(".")
	if err != nil || uidOf(folder) != 0 {
		return false
	}

	return folder.Mode().Perm()&0o022 == 0 || folder.Mode()&fs.ModeSticky != 0
}

func uidOf(info fs.FileInfo) int {
	held, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return -1
	}

	return int(held.Uid)
}

func components(path string) []string {
	if !filepath.IsAbs(path) {
		if absolute, err := filepath.Abs(path); err == nil {
			path = absolute
		}
	}

	var parts []string
	for _, part := range strings.Split(filepath.Clean(path), separator) {
		if part != "" {
			parts = append(parts, part)
		}
	}

	return parts
}

func unwrapped(err error) error {
	var path *fs.PathError
	if errors.As(err, &path) {
		return path.Err
	}

	return err
}

// openParent opens the folder a path names its entry in, through trusted links only, and says the entry's name there.
func openParent(path string) (*os.Root, string, error) {
	name := filepath.Base(path)
	if name == separator || name == "." || name == ".." {
		return nil, "", &fs.PathError{Op: "open", Path: path, Err: syscall.EINVAL}
	}

	dir, err := openDir(filepath.Dir(path))
	if err != nil {
		return nil, "", err
	}

	return dir, name, nil
}

// openEntry opens the regular file at name, never a link there nor a pipe swapped in, which would block the open.
func openEntry(dir *os.Root, name string, flag int) (*os.File, fs.FileInfo, error) {
	seen, err := dir.Lstat(name)
	if err != nil {
		return nil, nil, err
	}

	if err := regular(name, seen); err != nil {
		return nil, nil, err
	}

	handle, err := dir.OpenFile(name, flag|syscall.O_NONBLOCK, 0)
	if err != nil {
		return nil, nil, err
	}

	opened, err := handle.Stat()
	if err != nil || !os.SameFile(seen, opened) {
		handle.Close()

		return nil, nil, &fs.PathError{Op: "open", Path: name, Err: errChanged}
	}

	return handle, opened, nil
}

func regular(name string, info fs.FileInfo) error {
	switch {
	case info.Mode()&fs.ModeSymlink != 0:
		return &fs.PathError{Op: "open", Path: name, Err: syscall.ELOOP}
	case !info.Mode().IsRegular():
		return &fs.PathError{Op: "open", Path: name, Err: syscall.EINVAL}
	}

	return nil
}

// openRegular opens a file for reading, trusting only root's links on the way and none at its name.
func openRegular(path string) (*os.File, error) {
	dir, name, err := openParent(path)
	if err != nil {
		return nil, err
	}
	defer dir.Close()

	handle, _, err := openEntry(dir, name, os.O_RDONLY)

	return handle, err
}
