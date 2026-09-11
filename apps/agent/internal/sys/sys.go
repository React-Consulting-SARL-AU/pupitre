package sys

import (
	"fmt"
	"io/fs"
	"strings"
	"syscall"
	"time"
)

// DefaultTimeout caps a command nobody bounded: an apt run or a download that
// never answers turns into a failed step with a reason, not a wait without end.
const DefaultTimeout = 30 * time.Minute

type Command struct {
	User      string
	Argv      []string
	Env       []string
	Dir       string
	Stdin     []byte
	StdinPath string
	Timeout   time.Duration
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
	// WriteFileIn replaces a file under root atomically: one that was there keeps its owner and its mode, a new one goes to owner.
	WriteFileIn(root, rel, owner string, data []byte) error
	// MkdirIn creates a folder under root, and everything it needed on the way, for owner.
	MkdirIn(root, rel, owner string) error
	// RenameIn moves an entry under root, both ends inside it.
	RenameIn(root, from, to string) error
	// RemoveIn deletes an entry under root, everything under it included when recursive.
	RemoveIn(root, rel string, recursive bool) error
	ReadDir(path string) ([]Entry, error)
	WriteFile(path string, data []byte, mode fs.FileMode) error
	// AppendFile creates a missing file for its owner, as that user's own tee would have.
	AppendFile(path string, data []byte, owner string) error
	// Stat describes a regular file and refuses a symlink, so a listing never follows one out of its folder.
	Stat(path string) (size int64, mtime time.Time, err error)
	Remove(path string) error
	Exists(path string) (bool, error)
	Chown(path, user, group string) error
	Owner(path string) (string, error)
	MkdirAll(path string, mode fs.FileMode) error
	Signal(pid int, sig syscall.Signal) error
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
