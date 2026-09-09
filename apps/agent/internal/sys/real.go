package sys

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

type Real struct{}

func (Real) Run(cmd Command) (Output, error) {
	if len(cmd.Argv) == 0 {
		return Output{}, errors.New("empty command")
	}

	timeout := cmd.Timeout
	if timeout <= 0 {
		timeout = DefaultTimeout
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	process := exec.CommandContext(ctx, program(cmd), cmd.Argv[1:]...)
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

	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return out, fmt.Errorf("%s: no answer after %s", cmd.Argv[0], timeout)
	}

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

// Go looks a bare program up in this process's PATH, and the PATH the command
// carries for its user is only handed to the child: a tool in ~dev/.local/bin
// has to be found on the latter, or it is not found at all.
func program(cmd Command) string {
	name := cmd.Argv[0]
	if strings.Contains(name, string(os.PathSeparator)) {
		return name
	}

	path, given := ownPath(cmd.Env)
	if !given {
		return name
	}

	for _, dir := range filepath.SplitList(path) {
		if dir == "" {
			continue
		}

		candidate := filepath.Join(dir, name)
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() && info.Mode()&0o111 != 0 {
			return candidate
		}
	}

	return filepath.Join(filepath.SplitList(path)[0], name)
}

func ownPath(env []string) (string, bool) {
	for i := len(env) - 1; i >= 0; i-- {
		if path, found := strings.CutPrefix(env[i], "PATH="); found {
			return path, true
		}
	}

	return "", false
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

	return os.Lchown(path, uid, gid)
}

func (Real) Owner(path string) (string, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return "", err
	}

	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return "", errors.New("owner unavailable on this platform")
	}

	account, err := user.LookupId(strconv.FormatUint(uint64(stat.Uid), 10))
	if err != nil {
		return "", err
	}

	return account.Username, nil
}

func (Real) MkdirAll(path string, mode fs.FileMode) error {
	return os.MkdirAll(path, mode)
}
