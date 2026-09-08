package sys

import (
	"bytes"
	"context"
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strconv"
	"syscall"
)

type Real struct{}

func (Real) Run(cmd Command) (Output, error) {
	if len(cmd.Argv) == 0 {
		return Output{}, errors.New("empty command")
	}

	ctx := context.Background()
	if cmd.Timeout > 0 {
		limited, cancel := context.WithTimeout(ctx, cmd.Timeout)
		defer cancel()
		ctx = limited
	}

	process := exec.CommandContext(ctx, cmd.Argv[0], cmd.Argv[1:]...)
	process.Env = append(os.Environ(), cmd.Env...)
	process.Dir = cmd.Dir
	if len(cmd.Stdin) > 0 {
		process.Stdin = bytes.NewReader(cmd.Stdin)
	}

	if cmd.StdinPath != "" {
		input, err := os.Open(cmd.StdinPath)
		if err != nil {
			return Output{}, err
		}
		defer input.Close()

		process.Stdin = input
	}

	if cmd.User != "" && cmd.User != "root" {
		credential, err := credentialOf(cmd.User)
		if err != nil {
			return Output{}, err
		}
		process.SysProcAttr = &syscall.SysProcAttr{Credential: credential}
	}

	var stdout, stderr bytes.Buffer
	process.Stdout = &stdout
	process.Stderr = &stderr

	err := process.Run()
	out := Output{Stdout: stdout.String(), Stderr: stderr.String()}

	var exit *exec.ExitError
	if errors.As(err, &exit) {
		out.Code = exit.ExitCode()
		return out, &ExitError{Program: cmd.Argv[0], Code: out.Code, Stderr: out.Stderr}
	}

	if err != nil {
		return out, err
	}

	return out, nil
}

func credentialOf(name string) (*syscall.Credential, error) {
	account, err := user.Lookup(name)
	if err != nil {
		return nil, err
	}

	uid, err := strconv.ParseUint(account.Uid, 10, 32)
	if err != nil {
		return nil, err
	}

	gid, err := strconv.ParseUint(account.Gid, 10, 32)
	if err != nil {
		return nil, err
	}

	groupIDs, err := account.GroupIds()
	if err != nil {
		return nil, err
	}

	groups := make([]uint32, 0, len(groupIDs))
	for _, id := range groupIDs {
		parsed, err := strconv.ParseUint(id, 10, 32)
		if err != nil {
			return nil, err
		}
		groups = append(groups, uint32(parsed))
	}

	return &syscall.Credential{Uid: uint32(uid), Gid: uint32(gid), Groups: groups}, nil
}

func (Real) ReadFile(path string) ([]byte, error) {
	return os.ReadFile(path)
}

func (Real) ReadDir(path string) ([]Entry, error) {
	read, err := os.ReadDir(path)
	if err != nil {
		return nil, err
	}

	entries := make([]Entry, 0, len(read))
	for _, entry := range read {
		entries = append(entries, Entry{Name: entry.Name(), Dir: entry.IsDir()})
	}

	return entries, nil
}

func (Real) WriteFile(path string, data []byte, mode fs.FileMode) error {
	dir := filepath.Dir(path)

	tmp, err := os.CreateTemp(dir, "."+filepath.Base(path)+".*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()

	cleanup := func(err error) error {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}

	if _, err := tmp.Write(data); err != nil {
		return cleanup(err)
	}

	if err := tmp.Chmod(mode); err != nil {
		return cleanup(err)
	}

	if err := tmp.Sync(); err != nil {
		return cleanup(err)
	}

	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}

	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return err
	}

	return nil
}

func (Real) Remove(path string) error {
	err := os.Remove(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}

	return err
}

func (Real) Exists(path string) (bool, error) {
	_, err := os.Stat(path)
	if err == nil {
		return true, nil
	}

	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}

	return false, err
}

func (Real) Chown(path, owner, group string) error {
	account, err := user.Lookup(owner)
	if err != nil {
		return err
	}

	uid, err := strconv.Atoi(account.Uid)
	if err != nil {
		return err
	}

	gid, err := strconv.Atoi(account.Gid)
	if err != nil {
		return err
	}

	if group != "" {
		named, err := user.LookupGroup(group)
		if err != nil {
			return err
		}

		if gid, err = strconv.Atoi(named.Gid); err != nil {
			return err
		}
	}

	return os.Chown(path, uid, gid)
}

func (Real) MkdirAll(path string, mode fs.FileMode) error {
	return os.MkdirAll(path, mode)
}
