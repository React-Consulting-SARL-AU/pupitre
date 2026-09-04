package modtest

import (
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
)

type Values map[string]any

type Secrets map[string]string

type Options struct {
	Module   string
	Manifest contract.Manifest
	Values   Values
	Secrets  Secrets
	Emit     func(contract.StepEvent)
	Now      func() time.Time
}

func NewContext(t *testing.T, fake *FakeSys, options Options) *modules.Context {
	t.Helper()

	now := options.Now
	if now == nil {
		now = NewClock(10 * time.Millisecond).Now
	}

	manifest := options.Manifest
	if manifest.ID == "" {
		manifest.ID = options.Module
	}
	if manifest.ID == "" {
		manifest.ID = "tool.demo"
	}

	return modules.NewContext(modules.ContextOptions{
		Sys:      fake,
		Now:      now,
		Manifest: manifest,
		Values:   options.Values,
		Secrets:  options.Secrets,
		Emit:     options.Emit,
	})
}

type Clock struct {
	current time.Time
	tick    time.Duration
}

var Epoch = time.Date(2026, time.September, 4, 12, 0, 0, 0, time.UTC)

// Every reading advances the clock, so step durations are deterministic and non-zero.
func NewClock(tick time.Duration) *Clock {
	return &Clock{current: Epoch, tick: tick}
}

func (c *Clock) Now() time.Time {
	now := c.current
	c.current = c.current.Add(c.tick)

	return now
}
