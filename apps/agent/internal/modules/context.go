package modules

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/sys"
)

type Context struct {
	manifest contract.Manifest
	values   map[string]any
	secrets  map[string]string
	// What the server already applied for this module, when it is installed.
	held map[string]any
	run  *run

	steps  []contract.ReportStep
	failed bool
	warned bool
	// What the module had to say since the last step closed: it rides on that step.
	warning string
	// The step under way, which the report in progress shows as started.
	open string
}

type ContextOptions struct {
	Sys      sys.Sys
	Now      func() time.Time
	Manifest contract.Manifest
	Values   map[string]any
	Secrets  map[string]string
	// Held is what the machine already runs on for this module, as install.json remembers it.
	Held    map[string]any
	Emit    func(contract.StepEvent)
	LogPath string
	// InstallPath names the install.json to read the module's values and
	// secrets from, for a reader that holds no engine: a module is read on what
	// the machine remembers of it, never on the manifest defaults.
	InstallPath string
	// ProjectsLockPath is the lock the project registry is rewritten under; empty is no lock.
	ProjectsLockPath string
}

func NewContext(options ContextOptions) *Context {
	r := newRun(runOptions{Sys: options.Sys, Now: options.Now, Emit: options.Emit, LogPath: options.LogPath, ProjectsLock: options.ProjectsLockPath})

	if options.InstallPath != "" {
		remembered, err := Remembered(options.Sys, options.InstallPath)
		if err != nil {
			r.journal.logf("pupitred", "%s unreadable, ignored: %v", options.InstallPath, err)
		}

		r.redactAll(remembered.Secrets)

		return r.recalled(options.Manifest, remembered)
	}

	r.redactAll(map[string]map[string]string{options.Manifest.ID: options.Secrets})

	ctx := r.context(options.Manifest, options.Values, options.Secrets)
	ctx.held = options.Held

	return ctx
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

func (c *Context) Now() time.Time {
	return c.run.now()
}

func (c *Context) Logf(format string, args ...any) {
	c.run.journal.logf(c.manifest.ID, format, args...)
}

func (c *Context) Redact(text string) string {
	return c.run.journal.redact(text)
}

func (c *Context) Once(key string, fn func() error) error {
	return c.run.once(key, fn)
}

// ProjectsLock is the path the project registry is held under while a step rewrites it.
func (c *Context) ProjectsLock() string {
	return c.run.projectsLock
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
	return asInt(c.Value(key))
}

// Held answers the value the installed module runs on, or nil when the server never applied one.
func (c *Context) Held(key string) any {
	return c.held[key]
}

func asInt(value any) int {
	switch value := value.(type) {
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

// A list field of text arrives as the JSON array of the config line, one value per entry.
func (c *Context) StringList(key string) []string {
	switch value := c.Value(key).(type) {
	case []string:
		return value
	case []any:
		values := make([]string, 0, len(value))
		for _, entry := range value {
			values = append(values, fmt.Sprint(entry))
		}

		return values
	case string:
		if strings.TrimSpace(value) == "" {
			return nil
		}

		return []string{value}
	}

	return nil
}

func (c *Context) Secret(key string) string {
	return c.secrets[key]
}

// A list field of secrets arrives as one entry per rank, "<key>.0", "<key>.1", the secret line being a flat map of strings.
func (c *Context) SecretList(key string) []string {
	var values []string

	if single := c.secrets[key]; strings.TrimSpace(single) != "" {
		values = append(values, single)
	}

	for rank := 0; ; rank++ {
		value, listed := c.secrets[key+"."+strconv.Itoa(rank)]
		if !listed {
			break
		}

		if strings.TrimSpace(value) != "" {
			values = append(values, value)
		}
	}

	return values
}

func (c *Context) Step(name string, fn func() (Outcome, error)) error {
	started := c.run.now()
	c.open = name
	c.emit(name, contract.StepStart, 0, "", "")

	outcome, err := guard(fn)
	ms := c.run.now().Sub(started).Milliseconds()

	if err != nil || outcome == Failed {
		if err == nil {
			err = errors.New(i18n.T("modules.step.failed"))
		}

		return c.fail(name, ms, err)
	}

	status := contract.StepOK
	if outcome == Skipped {
		status = contract.StepSkip
	}

	warning := c.takeWarning()
	c.open = ""
	c.steps = append(c.steps, contract.ReportStep{Step: name, Status: status, Ms: ms, Message: warning})
	c.emit(name, status, ms, "", warning)
	c.Logf("%s %s", marker(status), name)

	return nil
}

func (c *Context) fail(name string, ms int64, err error) error {
	message := c.run.journal.redact(err.Error())
	replay := c.Replay()

	c.failed = true
	c.open = ""
	c.steps = append(c.steps, contract.ReportStep{Step: name, Status: contract.StepFail, Ms: ms, Replay: replay, Message: message})
	c.emit(name, contract.StepFail, ms, replay, message)
	c.Logf("✗ %s : %s", name, message)
	c.Logf("%s", i18n.T("modules.step.replay", replay))

	return &StepError{Module: c.manifest.ID, Step: name, Message: message, Replay: replay}
}

func (c *Context) Warn(message string) {
	if !c.warned {
		c.run.warned = append(c.run.warned, c.manifest.ID)
	}

	c.warned = true
	c.warning = strings.TrimSpace(c.warning + "\n" + c.run.journal.redact(message))
	c.Logf("! %s", message)
}

func (c *Context) takeWarning() string {
	warning := c.warning
	c.warning = ""

	return warning
}

func (c *Context) Events() []contract.StepEvent {
	return c.run.events
}

func (c *Context) Output() []string {
	return c.run.journal.lines()
}

func (c *Context) emit(step string, status contract.StepStatus, ms int64, replay, message string) {
	event := contract.StepEvent{Module: c.manifest.ID, Step: step, Status: status, Ms: ms, Replay: replay, Message: message}

	if status != contract.StepStart {
		c.run.events = append(c.run.events, event)
	}

	c.run.progress(c)

	if c.run.emit != nil {
		c.run.emit(event)
	}
}

// The module as it stands, the step under way included: what the report says
// of it while it is still at work.
func (c *Context) snapshot() contract.ModuleReport {
	steps := append([]contract.ReportStep{}, c.steps...)
	if c.open != "" {
		steps = append(steps, contract.ReportStep{Step: c.open, Status: contract.StepStart})
	}

	return contract.ModuleReport{ID: c.manifest.ID, Status: c.status(), Steps: steps}
}

// A warning said after the last step still reaches the report: on that step, or on one of its own.
func (c *Context) report() contract.ModuleReport {
	if warning := c.takeWarning(); warning != "" {
		if last := len(c.steps) - 1; last >= 0 && c.steps[last].Message == "" {
			c.steps[last].Message = warning
		} else {
			c.steps = append(c.steps, contract.ReportStep{Step: "warning", Status: contract.StepOK, Message: warning})
		}
	}

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

func guard(fn func() (Outcome, error)) (outcome Outcome, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			outcome, err = Failed, errors.New(i18n.T("engine.step.panic", recovered))
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
	sys          sys.Sys
	now          func() time.Time
	emit         func(contract.StepEvent)
	journal      *journal
	done         map[string]bool
	events       []contract.StepEvent
	warned       []string
	projectsLock string

	// The report as the modules already settled left it, the one at work, and
	// how the two reach the disk: before every step event, so the report is
	// never behind what the channel was told.
	written contract.Report
	current *Context
	persist func(contract.Report)
}

func (r *run) following(ctx *Context) {
	r.current = ctx
}

func (r *run) settled(report contract.Report) {
	r.written = report
	r.current = nil

	if r.persist != nil {
		r.persist(r.inProgress())
	}
}

func (r *run) progress(ctx *Context) {
	if r.persist == nil || r.current != ctx {
		return
	}

	r.persist(r.inProgress())
}

// FinishedAt stays empty: this report is the one of a run still under way.
func (r *run) inProgress() contract.Report {
	report := r.written
	report.Modules = append([]contract.ModuleReport{}, report.Modules...)
	report.Failed = append([]string{}, report.Failed...)
	report.Warned = append([]string{}, r.warned...)

	if r.current != nil {
		report.Modules = append(report.Modules, r.current.snapshot())
		if r.current.failed {
			report.Failed = append(report.Failed, r.current.manifest.ID)
		}
	}

	return report
}

type runOptions struct {
	Sys          sys.Sys
	Now          func() time.Time
	Emit         func(contract.StepEvent)
	LogPath      string
	ProjectsLock string
}

func newRun(options runOptions) *run {
	now := options.Now
	if now == nil {
		now = time.Now
	}

	return &run{
		sys:          options.Sys,
		now:          now,
		emit:         options.Emit,
		journal:      openJournal(options.LogPath, now),
		done:         map[string]bool{},
		projectsLock: options.ProjectsLock,
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

// recalled builds the context a module is read through: the values and secrets
// the machine remembers for it, which are also what it holds.
func (r *run) recalled(manifest contract.Manifest, remembered Request) *Context {
	ctx := r.context(manifest, remembered.Config[manifest.ID], remembered.Secrets[manifest.ID])
	ctx.held = remembered.Config[manifest.ID]

	return ctx
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
