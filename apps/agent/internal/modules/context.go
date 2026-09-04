package modules

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/sys"
)

type Context struct {
	manifest contract.Manifest
	values   map[string]any
	secrets  map[string]string
	run      *run

	steps  []contract.ReportStep
	failed bool
	warned bool
}

type ContextOptions struct {
	Sys      sys.Sys
	Now      func() time.Time
	Manifest contract.Manifest
	Values   map[string]any
	Secrets  map[string]string
	Emit     func(contract.StepEvent)
	LogPath  string
}

func NewContext(options ContextOptions) *Context {
	r := newRun(runOptions{Sys: options.Sys, Now: options.Now, Emit: options.Emit, LogPath: options.LogPath})
	r.redactAll(map[string]map[string]string{options.Manifest.ID: options.Secrets})

	return r.context(options.Manifest, options.Values, options.Secrets)
}

func (c *Context) Module() string {
	return c.manifest.ID
}

func (c *Context) Manifest() contract.Manifest {
	return c.manifest
}

func (c *Context) Sys() sys.Sys {
	return c.run.sys
}

func (c *Context) Logf(format string, args ...any) {
	c.run.journal.logf(c.manifest.ID, format, args...)
}

func (c *Context) Once(key string, fn func() error) error {
	return c.run.once(key, fn)
}

func (c *Context) Replay() string {
	return Replay(c.manifest.ID)
}

func (c *Context) Value(key string) any {
	if value, ok := c.values[key]; ok && value != nil {
		return value
	}

	for _, field := range c.manifest.Fields {
		if field.Key == key {
			return field.Default
		}
	}

	return nil
}

func (c *Context) String(key string) string {
	value := c.Value(key)
	if value == nil {
		return ""
	}

	return fmt.Sprint(value)
}

func (c *Context) Int(key string) int {
	switch value := c.Value(key).(type) {
	case int:
		return value
	case int64:
		return int(value)
	case float64:
		return int(value)
	case json.Number:
		parsed, _ := value.Int64()
		return int(parsed)
	case string:
		parsed, _ := strconv.Atoi(value)
		return parsed
	}

	return 0
}

func (c *Context) Bool(key string) bool {
	switch value := c.Value(key).(type) {
	case bool:
		return value
	case string:
		return value == "true"
	}

	return false
}

func (c *Context) Secret(key string) string {
	return c.secrets[key]
}

func (c *Context) Step(name string, fn func() (Outcome, error)) error {
	started := c.run.now()
	c.emit(name, contract.StepStart, 0, "")

	outcome, err := guard(fn)
	ms := c.run.now().Sub(started).Milliseconds()

	if err != nil || outcome == Failed {
		if err == nil {
			err = errors.New("étape en échec")
		}

		return c.fail(name, ms, err)
	}

	status := contract.StepOK
	if outcome == Skipped {
		status = contract.StepSkip
	}

	c.steps = append(c.steps, contract.ReportStep{Step: name, Status: status, Ms: ms})
	c.emit(name, status, ms, "")
	c.Logf("%s %s", marker(status), name)

	return nil
}

func (c *Context) fail(name string, ms int64, err error) error {
	message := c.run.journal.redact(err.Error())
	replay := c.Replay()

	c.failed = true
	c.steps = append(c.steps, contract.ReportStep{Step: name, Status: contract.StepFail, Ms: ms, Replay: replay, Message: message})
	c.emit(name, contract.StepFail, ms, replay)
	c.Logf("✗ %s : %s", name, message)
	c.Logf("  rejeu : %s", replay)

	return &StepError{Module: c.manifest.ID, Step: name, Message: message, Replay: replay}
}

func (c *Context) Warn(message string) {
	c.warned = true
	c.run.warned = append(c.run.warned, c.manifest.ID+" : "+c.run.journal.redact(message))
	c.Logf("! %s", message)
}

func (c *Context) Events() []contract.StepEvent {
	return c.run.events
}

func (c *Context) Output() []string {
	return c.run.journal.lines()
}

func (c *Context) emit(step string, status contract.StepStatus, ms int64, replay string) {
	event := contract.StepEvent{Module: c.manifest.ID, Step: step, Status: status, Ms: ms, Replay: replay}

	if status != contract.StepStart {
		c.run.events = append(c.run.events, event)
	}

	if c.run.emit != nil {
		c.run.emit(event)
	}
}

func (c *Context) report() contract.ModuleReport {
	steps := c.steps
	if steps == nil {
		steps = []contract.ReportStep{}
	}

	return contract.ModuleReport{ID: c.manifest.ID, Status: c.status(), Steps: steps}
}

func (c *Context) status() contract.ModuleStatus {
	switch {
	case c.failed:
		return contract.ModuleFail
	case c.warned:
		return contract.ModuleWarn
	case len(c.steps) > 0 && c.allSkipped():
		return contract.ModuleSkip
	}

	return contract.ModuleOK
}

func (c *Context) allSkipped() bool {
	for _, step := range c.steps {
		if step.Status != contract.StepSkip {
			return false
		}
	}

	return true
}

func (c *Context) failures() []string {
	var lines []string
	for _, step := range c.steps {
		if step.Status == contract.StepFail {
			lines = append(lines, fmt.Sprintf("%s · %s : %s · rejeu : %s", c.manifest.ID, step.Step, step.Message, step.Replay))
		}
	}

	return lines
}

func guard(fn func() (Outcome, error)) (outcome Outcome, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			outcome, err = Failed, fmt.Errorf("panique : %v", recovered)
		}
	}()

	return fn()
}

func marker(status contract.StepStatus) string {
	if status == contract.StepSkip {
		return "·"
	}

	return "✓"
}

type run struct {
	sys     sys.Sys
	now     func() time.Time
	emit    func(contract.StepEvent)
	journal *journal
	done    map[string]bool
	events  []contract.StepEvent
	warned  []string
}

type runOptions struct {
	Sys     sys.Sys
	Now     func() time.Time
	Emit    func(contract.StepEvent)
	LogPath string
}

func newRun(options runOptions) *run {
	now := options.Now
	if now == nil {
		now = time.Now
	}

	return &run{
		sys:     options.Sys,
		now:     now,
		emit:    options.Emit,
		journal: openJournal(options.LogPath, now),
		done:    map[string]bool{},
	}
}

func (r *run) context(manifest contract.Manifest, values map[string]any, secrets map[string]string) *Context {
	if values == nil {
		values = map[string]any{}
	}

	if secrets == nil {
		secrets = map[string]string{}
	}

	return &Context{manifest: manifest, values: values, secrets: secrets, run: r}
}

func (r *run) redactAll(secrets map[string]map[string]string) {
	for _, values := range secrets {
		for _, value := range values {
			if strings.TrimSpace(value) != "" {
				r.journal.hide(value)
			}
		}
	}
}

func (r *run) once(key string, fn func() error) error {
	if r.done[key] {
		return nil
	}

	if err := fn(); err != nil {
		return err
	}

	r.done[key] = true

	return nil
}

func (r *run) close() {
	r.journal.close()
}
