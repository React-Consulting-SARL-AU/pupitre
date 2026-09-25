package sys

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
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

const maxLinkHops = 8

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
	if cmd.Output != nil {
		child.process.Stdout = cmd.Output
	}

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

	// A line the scanner cannot hold leaves the child writing into a pipe nobody drains: it is taken down rather than waited on.
	if scanErr := scanner.Err(); scanErr != nil {
		_ = child.process.Cancel()
		_ = child.process.Wait()

		return fmt.Errorf("%s: %w", cmd.Argv[0], scanErr)
	}

	err = child.process.Wait()
	if child.expired() || child.cancelled() {
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

func (c child) cancelled() bool {
	return errors.Is(c.ctx.Err(), context.Canceled)
}

func prepare(cmd Command) (child, error) {
	if len(cmd.Argv) == 0 {
		return child{}, errors.New("empty command")
	}

	timeout := cmd.Timeout
	if timeout <= 0 {
		timeout = DefaultTimeout
	}

	parent := cmd.Context
	if parent == nil {
		parent = context.Background()
	}

	ctx, cancel := context.WithTimeout(parent, timeout)
	release := cancel

	process := exec.CommandContext(ctx, program(cmd), cmd.Argv[1:]...)
	process.Env = append(os.Environ(), cmd.Env...)
	process.Dir = cmd.Dir
	if len(cmd.Stdin) > 0 {
		process.Stdin = bytes.NewReader(cmd.Stdin)
	}

	if cmd.Input != nil {
		process.Stdin = cmd.Input
	}

	if cmd.StdinPath != "" {
		input, err := openRegular(cmd.StdinPath)
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

func (Real) ReadTail(path string, max int64) ([]byte, error) {
	handle, err := openRegular(path)
	if err != nil {
		return nil, err
	}
	defer handle.Close()

	info, err := handle.Stat()
	if err != nil {
		return nil, err
	}

	from := max0(info.Size() - max)
	if _, err := handle.Seek(from, io.SeekStart); err != nil {
		return nil, err
	}

	return io.ReadAll(handle)
}

func (Real) ReadFrom(path string, offset int64) ([]byte, error) {
	handle, err := openRegular(path)
	if err != nil {
		return nil, err
	}
	defer handle.Close()

	info, err := handle.Stat()
	if err != nil {
		return nil, err
	}

	if offset > info.Size() {
		offset = 0
	}

	if _, err := handle.Seek(offset, io.SeekStart); err != nil {
		return nil, err
	}

	return io.ReadAll(handle)
}

func max0(value int64) int64 {
	if value < 0 {
		return 0
	}

	return value
}

// The open never waits on a pipe, and what is not a regular file is refused before a byte is read.
func (Real) ReadFileIn(root, rel string) ([]byte, error) {
	scoped, err := os.OpenRoot(root)
	if err != nil {
		return nil, err
	}
	defer scoped.Close()

	handle, err := scoped.OpenFile(rel, os.O_RDONLY|syscall.O_NONBLOCK, 0)
	if err != nil {
		return nil, err
	}
	defer handle.Close()

	info, err := handle.Stat()
	if err != nil {
		return nil, err
	}

	if !info.Mode().IsRegular() {
		return nil, &fs.PathError{Op: "read", Path: rel, Err: ErrNotRegular}
	}

	return io.ReadAll(handle)
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

	target, err := resolveLinks(scoped, inside(rel))
	if err != nil {
		return err
	}

	dir, err := scoped.OpenRoot(inside(filepath.Dir(target)))
	if err != nil {
		return err
	}
	defer dir.Close()

	name := filepath.Base(target)

	mode, uid, gid := DefaultMode, -1, -1
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

	return replace(dir, name, data, mode, uid, gid)
}

// replace publishes data under name by a rename from a file written beside it: a link at the name is replaced, never written through.
func replace(dir *os.Root, name string, data []byte, mode fs.FileMode, uid, gid int) error {
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

// A link is written through to what it names, as long as every hop stays under
// the root: os.Root refuses an absolute target and one that climbs out, and a
// chain that never ends is refused rather than followed.
func resolveLinks(scoped *os.Root, rel string) (string, error) {
	for range maxLinkHops {
		info, err := scoped.Lstat(rel)
		if err != nil || info.Mode()&fs.ModeSymlink == 0 {
			return rel, nil
		}

		target, err := scoped.Readlink(rel)
		if err != nil {
			return "", err
		}

		if filepath.IsAbs(target) {
			return "", &fs.PathError{Op: "openat", Path: rel, Err: syscall.EXDEV}
		}

		rel = inside(filepath.Join(filepath.Dir(rel), target))
		if rel == ".." || strings.HasPrefix(rel, "../") {
			return "", &fs.PathError{Op: "openat", Path: rel, Err: syscall.EXDEV}
		}
	}

	return "", &fs.PathError{Op: "openat", Path: rel, Err: syscall.ELOOP}
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
	case !info.Mode().IsRegular():
		node.Kind = NodeSpecial
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

// A file that already exists keeps its owner: replacing the inode is how the
// write stays atomic, and it must not hand a user's file to root. The mode is
// the one asked for, so a file left too open by an earlier run gets tightened.
func (Real) WriteFile(path string, data []byte, mode fs.FileMode) error {
	dir, name, err := openParent(path)
	if err != nil {
		return err
	}
	defer dir.Close()

	uid, gid := -1, -1
	if existing, err := dir.Lstat(name); err == nil && existing.Mode().IsRegular() {
		if mode == KeepMode {
			mode = existing.Mode().Perm()
		}

		if held, ok := existing.Sys().(*syscall.Stat_t); ok {
			uid, gid = int(held.Uid), int(held.Gid)
		}
	}

	if mode == KeepMode {
		mode = DefaultMode
	}

	err = replace(dir, name, data, mode, uid, gid)

	// A bind-mounted file — /etc/hosts in a container — cannot be replaced, only rewritten where it stands.
	if errors.Is(err, syscall.EBUSY) {
		return rewrite(dir, name, data)
	}

	return err
}

func rewrite(dir *os.Root, name string, data []byte) error {
	handle, _, err := openEntry(dir, name, os.O_WRONLY)
	if err != nil {
		return err
	}
	defer handle.Close()

	if err := handle.Truncate(0); err != nil {
		return err
	}

	_, err = handle.Write(data)

	return err
}

func (Real) AppendFile(path string, data []byte, owner string) error {
	dir, name, err := openParent(path)
	if err != nil {
		return err
	}
	defer dir.Close()

	handle, err := dir.OpenFile(name, os.O_WRONLY|os.O_APPEND|os.O_CREATE|os.O_EXCL, 0o644)
	switch {
	case err == nil:
		if err := chownHandle(handle, owner); err != nil {
			handle.Close()

			return err
		}
	case errors.Is(err, fs.ErrExist):
		if handle, _, err = openEntry(dir, name, os.O_WRONLY|os.O_APPEND); err != nil {
			return err
		}
	default:
		return err
	}
	defer handle.Close()

	_, err = handle.Write(data)

	return err
}

func chownHandle(handle *os.File, owner string) error {
	if owner == "" {
		return nil
	}

	uid, gid, err := idsOf(owner, "")
	if err != nil {
		return err
	}

	return handle.Chown(uid, gid)
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
	dir, name, err := openParent(path)
	if err == nil {
		err = dir.Remove(name)
		dir.Close()
	}

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

	dir, name, err := openParent(path)
	if err != nil {
		return err
	}
	defer dir.Close()

	return dir.Lchown(name, uid, gid)
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

// Each folder made is entered only once checked to be the one made: a link swapped in for it is refused.
func (Real) MkdirAll(path string, mode fs.FileMode) error {
	parts := components(path)

	existing := len(parts)
	var dir *os.Root
	for ; existing >= 0; existing-- {
		opened, err := openDir(separator + filepath.Join(parts[:existing]...))
		if err == nil {
			dir = opened

			break
		}

		if !errors.Is(err, fs.ErrNotExist) {
			return err
		}
	}

	if dir == nil {
		return &fs.PathError{Op: "mkdir", Path: path, Err: fs.ErrNotExist}
	}

	for _, name := range parts[existing:] {
		if err := dir.Mkdir(name, mode); err != nil && !errors.Is(err, fs.ErrExist) {
			dir.Close()

			return err
		}

		seen, err := dir.Lstat(name)
		if err != nil {
			dir.Close()

			return err
		}

		next, err := enter(dir, name, seen)
		dir.Close()
		if err != nil {
			return &fs.PathError{Op: "mkdir", Path: path, Err: err}
		}

		dir = next
	}

	return dir.Close()
}

func (Real) CreateIn(root, rel, owner string) (io.WriteCloser, error) {
	scoped, err := os.OpenRoot(root)
	if err != nil {
		return nil, err
	}
	defer scoped.Close()

	dir, err := scoped.OpenRoot(inside(filepath.Dir(rel)))
	if err != nil {
		return nil, err
	}
	defer dir.Close()

	name := filepath.Base(rel)
	if err := dir.Remove(name); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, err
	}

	handle, err := dir.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return nil, err
	}

	if err := chownHandle(handle, owner); err != nil {
		handle.Close()
		dir.Remove(name)

		return nil, err
	}

	return handle, nil
}

func (Real) Signal(pid int, owner string, sig syscall.Signal) error {
	if owner == "" {
		return syscall.Kill(pid, sig)
	}

	// ps prints a uid in place of a name too long for its column.
	uid, err := strconv.Atoi(owner)
	if err != nil {
		if uid, _, err = idsOf(owner, ""); err != nil {
			return err
		}
	}

	return signalAs(pid, uid, sig)
}
