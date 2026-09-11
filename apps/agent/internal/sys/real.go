package sys

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io/fs"
	"math/rand/v2"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// A killed child leaves no orphan holding the pipes open: the whole process group goes with it.
const killGrace = 2 * time.Second

type Real struct{}

func (Real) Run(cmd Command) (Output, error) {
	child, err := prepare(cmd)
	if err != nil {
		return Output{}, err
	}
	defer child.release()

	var stdout, stderr bytes.Buffer
	child.process.Stdout = &stdout
	child.process.Stderr = &stderr

	err = child.process.Run()
	out := Output{Stdout: stdout.String(), Stderr: stderr.String()}

	if child.expired() {
		return out, fmt.Errorf("%s: no answer after %s", cmd.Argv[0], child.timeout)
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

// Stream hands each line of standard output over as it is written. The timeout
// is the length of the stream, not a failure: a follow is bounded by design,
// and ends without an error when its time is up.
func (Real) Stream(cmd Command, emit func(line string)) error {
	child, err := prepare(cmd)
	if err != nil {
		return err
	}
	defer child.release()

	var stderr bytes.Buffer
	child.process.Stderr = &stderr

	pipe, err := child.process.StdoutPipe()
	if err != nil {
		return err
	}

	if err := child.process.Start(); err != nil {
		return err
	}

	scanner := bufio.NewScanner(pipe)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		emit(scanner.Text())
	}

	err = child.process.Wait()
	if child.expired() {
		return nil
	}

	var exit *exec.ExitError
	if errors.As(err, &exit) {
		return &ExitError{Program: cmd.Argv[0], Code: exit.ExitCode(), Stderr: stderr.String()}
	}

	return err
}

type child struct {
	process *exec.Cmd
	timeout time.Duration
	ctx     context.Context
	release func()
}

func (c child) expired() bool {
	return errors.Is(c.ctx.Err(), context.DeadlineExceeded)
}

func prepare(cmd Command) (child, error) {
	if len(cmd.Argv) == 0 {
		return child{}, errors.New("empty command")
	}

	timeout := cmd.Timeout
	if timeout <= 0 {
		timeout = DefaultTimeout
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	release := cancel

	process := exec.CommandContext(ctx, program(cmd), cmd.Argv[1:]...)
	process.Env = append(os.Environ(), cmd.Env...)
	process.Dir = cmd.Dir
	if len(cmd.Stdin) > 0 {
		process.Stdin = bytes.NewReader(cmd.Stdin)
	}

	if cmd.StdinPath != "" {
		input, err := os.Open(cmd.StdinPath)
		if err != nil {
			cancel()

			return child{}, err
		}

		process.Stdin = input
		release = func() {
			cancel()
			input.Close()
		}
	}

	process.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	process.Cancel = func() error { return syscall.Kill(-process.Process.Pid, syscall.SIGKILL) }
	process.WaitDelay = killGrace

	if cmd.User != "" && cmd.User != "root" {
		credential, err := credentialOf(cmd.User)
		if err != nil {
			release()

			return child{}, err
		}
		process.SysProcAttr.Credential = credential
	}

	return child{process: process, timeout: timeout, ctx: ctx, release: release}, nil
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

	dirs := filepath.SplitList(path)
	if len(dirs) == 0 {
		return name
	}

	for _, dir := range dirs {
		if dir == "" {
			continue
		}

		candidate := filepath.Join(dir, name)
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() && info.Mode()&0o111 != 0 {
			return candidate
		}
	}

	return filepath.Join(dirs[0], name)
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

func (Real) ReadFileIn(root, rel string) ([]byte, error) {
	scoped, err := os.OpenRoot(root)
	if err != nil {
		return nil, err
	}
	defer scoped.Close()

	return scoped.ReadFile(rel)
}

func (Real) ListIn(root, rel string) ([]Node, error) {
	scoped, err := os.OpenRoot(root)
	if err != nil {
		return nil, err
	}
	defer scoped.Close()

	read, err := fs.ReadDir(scoped.FS(), inside(rel))
	if err != nil {
		return nil, err
	}

	nodes := make([]Node, 0, len(read))
	for _, entry := range read {
		info, err := scoped.Lstat(filepath.Join(inside(rel), entry.Name()))
		if err != nil {
			continue
		}

		nodes = append(nodes, nodeOf(entry.Name(), info))
	}

	return nodes, nil
}

func (Real) StatIn(root, rel string) (Node, error) {
	scoped, err := os.OpenRoot(root)
	if err != nil {
		return Node{}, err
	}
	defer scoped.Close()

	name := inside(rel)

	info, err := scoped.Lstat(name)
	if err != nil {
		return Node{}, err
	}

	node := nodeOf(filepath.Base(name), info)
	if node.Kind != NodeLink {
		return node, nil
	}

	// A link is described by what it points at, and os.Root is what refuses one pointing out of the root.
	target, err := scoped.Stat(name)
	if err != nil {
		return Node{}, err
	}

	node.SizeBytes = target.Size()
	node.ModifiedAt = target.ModTime()
	node.Mode = target.Mode().Perm()

	return node, nil
}

func (Real) WriteFileIn(root, rel, owner string, data []byte) error {
	scoped, err := os.OpenRoot(root)
	if err != nil {
		return err
	}
	defer scoped.Close()

	dir, err := scoped.OpenRoot(inside(filepath.Dir(rel)))
	if err != nil {
		return err
	}
	defer dir.Close()

	name := filepath.Base(rel)

	mode, uid, gid := fs.FileMode(0o644), -1, -1
	if existing, err := dir.Lstat(name); err == nil && existing.Mode().IsRegular() {
		mode = existing.Mode().Perm()
		if held, ok := existing.Sys().(*syscall.Stat_t); ok {
			uid, gid = int(held.Uid), int(held.Gid)
		}
	} else if owner != "" {
		uid, gid, err = idsOf(owner, "")
		if err != nil {
			return err
		}
	}

	tmp, tmpName, err := neighbour(dir, name)
	if err != nil {
		return err
	}

	cleanup := func(err error) error {
		tmp.Close()
		dir.Remove(tmpName)

		return err
	}

	if _, err := tmp.Write(data); err != nil {
		return cleanup(err)
	}

	if err := tmp.Chmod(mode); err != nil {
		return cleanup(err)
	}

	if uid >= 0 {
		if err := tmp.Chown(uid, gid); err != nil {
			return cleanup(err)
		}
	}

	if err := tmp.Sync(); err != nil {
		return cleanup(err)
	}

	if err := tmp.Close(); err != nil {
		dir.Remove(tmpName)

		return err
	}

	if err := dir.Rename(tmpName, name); err != nil {
		dir.Remove(tmpName)

		return err
	}

	return nil
}

// The file is written next to the one it replaces, so the rename that publishes it never crosses a file system.
func neighbour(dir *os.Root, name string) (*os.File, string, error) {
	for range 10 {
		candidate := "." + name + "." + strconv.FormatUint(rand.Uint64(), 36)

		handle, err := dir.OpenFile(candidate, os.O_RDWR|os.O_CREATE|os.O_EXCL, 0o600)
		if err == nil {
			return handle, candidate, nil
		}

		if !errors.Is(err, fs.ErrExist) {
			return nil, "", err
		}
	}

	return nil, "", fs.ErrExist
}

func (Real) MkdirIn(root, rel, owner string) error {
	scoped, err := os.OpenRoot(root)
	if err != nil {
		return err
	}
	defer scoped.Close()

	var created []string
	for dir := inside(rel); dir != "."; dir = filepath.Dir(dir) {
		if _, err := scoped.Lstat(dir); err == nil {
			break
		}

		created = append(created, dir)
	}

	if err := scoped.MkdirAll(inside(rel), 0o755); err != nil {
		return err
	}

	if owner == "" {
		return nil
	}

	uid, gid, err := idsOf(owner, "")
	if err != nil {
		return err
	}

	for _, dir := range created {
		if err := scoped.Lchown(dir, uid, gid); err != nil {
			return err
		}
	}

	return nil
}

func (Real) RenameIn(root, from, to string) error {
	scoped, err := os.OpenRoot(root)
	if err != nil {
		return err
	}
	defer scoped.Close()

	return scoped.Rename(inside(from), inside(to))
}

func (Real) RemoveIn(root, rel string, recursive bool) error {
	scoped, err := os.OpenRoot(root)
	if err != nil {
		return err
	}
	defer scoped.Close()

	if recursive {
		return scoped.RemoveAll(inside(rel))
	}

	return scoped.Remove(inside(rel))
}

func nodeOf(name string, info fs.FileInfo) Node {
	node := Node{Name: name, Kind: NodeFile, SizeBytes: info.Size(), ModifiedAt: info.ModTime(), Mode: info.Mode().Perm()}

	switch {
	case info.Mode()&fs.ModeSymlink != 0:
		node.Kind = NodeLink
	case info.IsDir():
		node.Kind = NodeDir
	}

	return node
}

// The root itself is "." for os.Root, which reads no other name for it.
func inside(rel string) string {
	if rel == "" || rel == "/" {
		return "."
	}

	return filepath.Clean(rel)
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

// A file that already exists keeps its owner and its mode: replacing the
// inode is how the write stays atomic, and it must not hand a user's file to root.
func (Real) WriteFile(path string, data []byte, mode fs.FileMode) error {
	dir := filepath.Dir(path)

	var owner *syscall.Stat_t
	if existing, err := os.Lstat(path); err == nil && existing.Mode().IsRegular() {
		mode = existing.Mode().Perm()
		owner, _ = existing.Sys().(*syscall.Stat_t)
	}

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

	if owner != nil {
		if err := tmp.Chown(int(owner.Uid), int(owner.Gid)); err != nil {
			return cleanup(err)
		}
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

func (Real) AppendFile(path string, data []byte, owner string) error {
	_, err := os.Lstat(path)
	created := errors.Is(err, fs.ErrNotExist)

	handle, err := os.OpenFile(path, os.O_WRONLY|os.O_APPEND|os.O_CREATE, 0o644)
	if err != nil {
		return err
	}
	defer handle.Close()

	if created && owner != "" {
		uid, gid, err := idsOf(owner, "")
		if err != nil {
			return err
		}

		if err := handle.Chown(uid, gid); err != nil {
			return err
		}
	}

	_, err = handle.Write(data)

	return err
}

func (Real) Stat(path string) (int64, time.Time, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return 0, time.Time{}, err
	}

	if !info.Mode().IsRegular() {
		return 0, time.Time{}, &fs.PathError{Op: "stat", Path: path, Err: syscall.EINVAL}
	}

	return info.Size(), info.ModTime(), nil
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
	uid, gid, err := idsOf(owner, group)
	if err != nil {
		return err
	}

	return os.Lchown(path, uid, gid)
}

// An empty group means the owner's own.
func idsOf(owner, group string) (int, int, error) {
	account, err := user.Lookup(owner)
	if err != nil {
		return 0, 0, err
	}

	uid, err := strconv.Atoi(account.Uid)
	if err != nil {
		return 0, 0, err
	}

	gid, err := strconv.Atoi(account.Gid)
	if err != nil {
		return 0, 0, err
	}

	if group == "" {
		return uid, gid, nil
	}

	named, err := user.LookupGroup(group)
	if err != nil {
		return 0, 0, err
	}

	gid, err = strconv.Atoi(named.Gid)
	if err != nil {
		return 0, 0, err
	}

	return uid, gid, nil
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

func (Real) Signal(pid int, sig syscall.Signal) error {
	return syscall.Kill(pid, sig)
}
