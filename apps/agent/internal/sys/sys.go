package sys

import (
	"fmt"
	"io/fs"
	"strings"
)

type Command struct {
	User      string
	Argv      []string
	Env       []string
	Dir       string
	Stdin     []byte
	StdinPath string
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

func (e *ExitError) Error() string {
	detail := strings.TrimSpace(e.Stderr)
	if detail == "" {
		return fmt.Sprintf("%s a échoué (code %d)", e.Program, e.Code)
	}

	return fmt.Sprintf("%s a échoué (code %d) : %s", e.Program, e.Code, lastLines(detail, 3))
}

// One entry of a folder. A symlink is never a directory here: descending one could walk out of the folder its parent belongs to.
type Entry struct {
	Name string
	Dir  bool
}

type Sys interface {
	Run(cmd Command) (Output, error)
	ReadFile(path string) ([]byte, error)
	ReadDir(path string) ([]Entry, error)
	WriteFile(path string, data []byte, mode fs.FileMode) error
	Remove(path string) error
	Exists(path string) (bool, error)
	Chown(path, user, group string) error
	MkdirAll(path string, mode fs.FileMode) error
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
