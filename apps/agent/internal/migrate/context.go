package migrate

import (
	"encoding/json"
	"errors"
	"io/fs"
	"path/filepath"
	"strings"
	"time"

	"pupitre.studio/agent/internal/sys"
)

// Raw JSON and lines on purpose: decoding into today's types would drop the old fields a migration must carry over.
type Context struct {
	Paths Paths

	machine sys.Sys
	logf    func(string, ...any)
	now     func() time.Time
}

func (c *Context) Sys() sys.Sys {
	return c.machine
}

func (c *Context) Now() time.Time {
	if c.now == nil {
		return time.Now()
	}

	return c.now()
}

func (c *Context) Logf(format string, args ...any) {
	if c.logf != nil {
		c.logf(format, args...)
	}
}

func (c *Context) Once(_ string, fn func() error) error {
	return fn()
}

func (c *Context) Exists(target Target) bool {
	exists, err := c.machine.Exists(c.Paths.Of(target))

	return err == nil && exists
}

func (c *Context) JSON(target Target) (map[string]any, bool, error) {
	raw, present, err := c.Read(target)
	if err != nil || !present {
		return nil, present, err
	}

	document := map[string]any{}

	if err := json.Unmarshal(raw, &document); err != nil {
		return nil, true, err
	}

	return document, true, nil
}

func (c *Context) SetJSON(target Target, document map[string]any) error {
	encoded, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return err
	}

	return c.Write(target, append(encoded, '\n'))
}

func (c *Context) Lines(target Target) ([]string, bool, error) {
	raw, present, err := c.Read(target)
	if err != nil || !present {
		return nil, present, err
	}

	content := strings.TrimSuffix(string(raw), "\n")
	if content == "" {
		return []string{}, true, nil
	}

	return strings.Split(content, "\n"), true, nil
}

func (c *Context) SetLines(target Target, lines []string) error {
	if len(lines) == 0 {
		return c.Write(target, nil)
	}

	return c.Write(target, []byte(strings.Join(lines, "\n")+"\n"))
}

func (c *Context) Read(target Target) ([]byte, bool, error) {
	raw, err := c.machine.ReadFile(c.Paths.Of(target))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, false, nil
	}

	if err != nil {
		return nil, false, err
	}

	return raw, true, nil
}

func (c *Context) Write(target Target, content []byte) error {
	return c.write(c.Paths.Of(target), content)
}

func (c *Context) Remove(target Target) error {
	return c.remove(c.Paths.Of(target))
}

func (c *Context) write(path string, content []byte) error {
	if err := c.machine.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}

	c.Logf("write %s", path)

	return c.machine.WriteFile(path, content, Mode)
}

func (c *Context) remove(path string) error {
	if err := c.machine.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}

	return nil
}
