package modtest

import (
	"fmt"

	"pupitre.studio/agent/internal/sys"
)

type SysContext struct {
	fake  *FakeSys
	done  map[string]bool
	lines []string
}

func NewSysContext(fake *FakeSys) *SysContext {
	return &SysContext{fake: fake, done: map[string]bool{}}
}

func (c *SysContext) Sys() sys.Sys {
	return c.fake
}

func (c *SysContext) Logf(format string, args ...any) {
	c.lines = append(c.lines, fmt.Sprintf(format, args...))
}

func (c *SysContext) Once(key string, fn func() error) error {
	if c.done[key] {
		return nil
	}

	if err := fn(); err != nil {
		return err
	}

	c.done[key] = true

	return nil
}

func (c *SysContext) Output() []string {
	return append([]string(nil), c.lines...)
}
