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

// A pipe opened for reading would hold the session until someone writes into it.
var ErrNotRegular = errors.New("not a regular file")

// Caps an unbounded command, so a stuck apt run or download fails with a reason instead of hanging.
const DefaultTimeout = 30 * time.Minute

const (
	// KeepMode leaves an existing file at its mode; a new one gets DefaultMode.
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
	// Streamed, so a multi-gigabyte dump never sits in memory.
	Input   io.Reader
	Output  io.Writer
	Timeout time.Duration
	Context context.Context
}

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

// A symlink is never a Dir here: descending one could walk out of its parent's folder.
type Entry struct {
	Name string
	Dir  bool
}

const (
	NodeFile = "file"
	NodeDir  = "dir"
	NodeLink = "link"
	// A pipe, a socket or a device: listed, never read.
	NodeSpecial = "special"
)

type Node struct {
	Name       string
	Kind       string
	SizeBytes  int64
	ModifiedAt time.Time
	Mode       fs.FileMode
}

type Sys interface {
	Run(cmd Command) (Output, error)
	// The timeout ends the stream and is not an error.
	Stream(cmd Command, emit func(line string)) error
	ReadFile(path string) ([]byte, error)
	// Refuses a path leaving root, symlinks included: root must never follow a link a user planted.
	ReadFileIn(root, rel string) ([]byte, error)
	// A link is listed as a link, never as its target.
	ListIn(root, rel string) ([]Node, error)
	// A link is reported as one but described by its target, refused when that target lies outside root.
	StatIn(root, rel string) (Node, error)
	// Atomic; an existing file keeps its owner and mode, a new one goes to owner; a link leaving root is refused.
	WriteFileIn(root, rel, owner string, data []byte) error
	MkdirIn(root, rel, owner string) error
	RenameIn(root, from, to string) error
	RemoveIn(root, rel string, recursive bool) error
	// Replaces whatever stood at the name, a link included, without writing through it.
	CreateIn(root, rel, owner string) (io.WriteCloser, error)
	ReadDir(path string) ([]Entry, error)
	// Like AppendFile, Chown, MkdirAll and Remove: follows a link only if root owns it and its folder; a user's file stays theirs.
	WriteFile(path string, data []byte, mode fs.FileMode) error
	// Creates a missing file for owner, as that user's own tee would, and refuses a link at the path.
	AppendFile(path string, data []byte, owner string) error
	// Refuses a symlink, so a listing never follows one out of its folder.
	Stat(path string) (size int64, mtime time.Time, err error)
	Remove(path string) error
	Exists(path string) (bool, error)
	Chown(path, user, group string) error
	Owner(path string) (string, error)
	MkdirAll(path string, mode fs.FileMode) error
	// With an owner, reaches the process only while it runs as that account, sparing a recycled pid.
	Signal(pid int, owner string, sig syscall.Signal) error
}

// For journals that grow for days; a Sys without it is read whole and cut by the caller.
type Ranged interface {
	ReadTail(path string, max int64) ([]byte, error)
	// A file shorter than offset was truncated and is read from its start.
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
