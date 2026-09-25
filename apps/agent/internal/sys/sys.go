package sys

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"strings"
	"syscall"
	"time"
)

// ErrNotRegular refuses a read of a pipe, a socket or a device: a pipe opened for reading holds the session until someone writes into it.
var ErrNotRegular = errors.New("not a regular file")

// DefaultTimeout caps a command nobody bounded: an apt run or a download that
// never answers turns into a failed step with a reason, not a wait without end.
const DefaultTimeout = 30 * time.Minute

const (
	// KeepMode asks a write to leave the file at the mode it has, DefaultMode when it is new.
	KeepMode    fs.FileMode = 0
	DefaultMode fs.FileMode = 0o644
)

type Command struct {
	User      string
	Argv      []string
	Env       []string
	Dir       string
	Stdin     []byte
	StdinPath string
	// Input streams the standard input and Output takes the standard output as it comes: a dump of gigabytes never sits in memory.
	Input   io.Reader
	Output  io.Writer
	Timeout time.Duration
	// Context, when set, ends the command before its timeout: a follow ends with the channel that reads it.
	Context context.Context
}

// Idle runs a heavy command behind everything else on the machine: nice 10 for the processor, the idle class for the disk.
func Idle(argv ...string) []string {
	return append([]string{"nice", "-n", "10", "ionice", "-c3"}, argv...)
}

type Output struct {
	Stdout string
	Stderr string
	Code   int
}

type ExitError struct {
	Program string
	Code    int
	Stderr  string
}

// Wording stays language-neutral: this text is interpolated into localized catalogue messages.
func (e *ExitError) Error() string {
	detail := strings.TrimSpace(e.Stderr)
	if detail == "" {
		return fmt.Sprintf("%s: exit %d", e.Program, e.Code)
	}

	return fmt.Sprintf("%s: exit %d: %s", e.Program, e.Code, lastLines(detail, 3))
}

// One entry of a folder. A symlink is never a directory here: descending one could walk out of the folder its parent belongs to.
type Entry struct {
	Name string
	Dir  bool
}

const (
	NodeFile = "file"
	NodeDir  = "dir"
	NodeLink = "link"
	// NodeSpecial is a pipe, a socket or a device: listed, never read.
	NodeSpecial = "special"
)

// What the file system says of one entry under a root, and the kind a listing shows it as.
type Node struct {
	Name       string
	Kind       string
	SizeBytes  int64
	ModifiedAt time.Time
	Mode       fs.FileMode
}

type Sys interface {
	Run(cmd Command) (Output, error)
	// Stream hands each line of standard output over as the command writes it; the timeout ends the stream and is not an error.
	Stream(cmd Command, emit func(line string)) error
	ReadFile(path string) ([]byte, error)
	// ReadFileIn refuses a path that leaves root, a symlink included: root reading a user's file must never follow a link that user planted.
	ReadFileIn(root, rel string) ([]byte, error)
	// ListIn describes one folder under root, each entry as it is on the disk: a link is a link, never what it points at.
	ListIn(root, rel string) ([]Node, error)
	// StatIn describes one entry under root. A link is said to be one, and described by its target, which refuses it when that target lies outside.
	StatIn(root, rel string) (Node, error)
	// WriteFileIn replaces a file under root atomically: one that was there keeps its owner and its mode, a new one goes to owner. A link that stays under root is written through, one that leaves it is refused.
	WriteFileIn(root, rel, owner string, data []byte) error
	// MkdirIn creates a folder under root, and everything it needed on the way, for owner.
	MkdirIn(root, rel, owner string) error
	// RenameIn moves an entry under root, both ends inside it.
	RenameIn(root, from, to string) error
	// RemoveIn deletes an entry under root, everything under it included when recursive.
	RemoveIn(root, rel string, recursive bool) error
	// CreateIn opens a new file under root for owner to stream into, replacing whatever stood at its name, a link included, without writing through it.
	CreateIn(root, rel, owner string) (io.WriteCloser, error)
	ReadDir(path string) ([]Entry, error)
	// WriteFile, AppendFile, Chown, MkdirAll and Remove follow a link on the way only when root owns it and its folder: never one another account could plant.
	// WriteFile replaces the file atomically at the mode asked for — KeepMode leaves it as it was — and never hands a user's file to root.
	WriteFile(path string, data []byte, mode fs.FileMode) error
	// AppendFile creates a missing file for its owner, as that user's own tee would have, and refuses a link at the path.
	AppendFile(path string, data []byte, owner string) error
	// Stat describes a regular file and refuses a symlink, so a listing never follows one out of its folder.
	Stat(path string) (size int64, mtime time.Time, err error)
	Remove(path string) error
	Exists(path string) (bool, error)
	Chown(path, user, group string) error
	Owner(path string) (string, error)
	MkdirAll(path string, mode fs.FileMode) error
	// Signal, given an owner, reaches the process only while it runs as that account, so a pid recycled since it was looked up is spared.
	Signal(pid int, owner string, sig syscall.Signal) error
}

// Ranged reads a file by ranges, which is what a journal that grows for days
// needs: never the whole of it. A machine that cannot is read whole, and cut
// by the caller.
type Ranged interface {
	// ReadTail is the last max bytes of the file, the whole of it when it is shorter.
	ReadTail(path string, max int64) ([]byte, error)
	// ReadFrom is what lies past offset; a file shorter than that was truncated, and is read from its start.
	ReadFrom(path string, offset int64) ([]byte, error)
}

type Context interface {
	Sys() Sys
	Logf(format string, args ...any)
	Once(key string, fn func() error) error
}

func Exec(ctx Context, cmd Command) (Output, error) {
	ctx.Logf("$ %s", Describe(cmd))

	out, err := ctx.Sys().Run(cmd)

	for _, line := range strings.Split(strings.TrimSpace(out.Stdout+"\n"+out.Stderr), "\n") {
		if line != "" {
			ctx.Logf("  %s", line)
		}
	}

	return out, err
}

func Describe(cmd Command) string {
	text := strings.Join(cmd.Argv, " ")
	if cmd.StdinPath != "" {
		text += " < " + cmd.StdinPath
	}

	if cmd.User != "" && cmd.User != "root" {
		text = "(" + cmd.User + ") " + text
	}

	return text
}

func lastLines(text string, count int) string {
	lines := strings.Split(text, "\n")
	if len(lines) > count {
		lines = lines[len(lines)-count:]
	}

	return strings.Join(lines, " / ")
}
