package state

import (
	"errors"
	"os"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/lock"
	"pupitre.studio/agent/internal/tmux"
)

const DomainKey = env.DomainKey

type FollowOptions struct {
	Interval time.Duration
	Limit    time.Duration
	Sleep    func(time.Duration)
}

// Sleep stays nil outside tests: a real follow waits on a timer it can leave the moment the channel is cut.
func (f FollowOptions) resolved() FollowOptions {
	if f.Interval == 0 {
		f.Interval = 250 * time.Millisecond
	}
	if f.Limit == 0 {
		f.Limit = 15 * time.Minute
	}

	return f
}

// Holders of the registry lock release it within milliseconds.
const registryWait = 5 * time.Second

// A second install, sync or pull answers busy instead of racing the first in the same directories.
const DefaultInstallLock = "/var/lib/pupitre/project-install.lock"

type Options struct {
	Sys          sys.Sys
	Now          func() time.Time
	Registry     *modules.Registry
	License      func() contract.License
	AgentVersion string
	Paths        registry.Paths
	Tmux         tmux.Options
	// Each channel is its own process, so only a file lock spans them; empty means no lock, which the tests rely on.
	InstallLock string
	InstallPath string
	// Modules installed without their settings: the one thing a module cannot tell of itself.
	Deferred func() []string
	// Runs a module action under the run lock and license, the same door the engine's install takes.
	Command    func(id string, sink modules.Sink, fn func(*modules.Context) error) error
	Follow     FollowOptions
	Shots      ShotOptions
	Detect     DetectOptions
	Self       func() int
	Sleep      func(time.Duration)
	GitTimeout time.Duration
}

const DefaultGitTimeout = 30 * time.Second

type Reader struct {
	options Options
	journal *modules.Context
}

func New(options Options) *Reader {
	options.Follow = options.Follow.resolved()
	if options.Now == nil {
		options.Now = time.Now
	}
	if options.GitTimeout == 0 {
		options.GitTimeout = DefaultGitTimeout
	}
	if options.Tmux.Now == nil {
		options.Tmux.Now = options.Now
	}
	options.Tmux = options.Tmux.Resolved()
	options.Shots = options.Shots.resolved(options.Tmux.User)
	options.Detect = options.Detect.resolved(options.Tmux.User)
	if options.Self == nil {
		options.Self = os.Getpid
	}
	if options.Sleep == nil {
		options.Sleep = time.Sleep
	}

	return &Reader{options: options}
}

// One journal per session: serve is long-lived, and reopening the log on every snapshot would leak a descriptor a second.
func (r *Reader) WithJournal(logPath string) *Reader {
	r.journal = modules.NewContext(modules.ContextOptions{
		Sys:      r.options.Sys,
		Now:      r.options.Now,
		Manifest: contract.Manifest{ID: "pupitred"},
		LogPath:  logPath,
	})

	return r
}

func (r *Reader) self() int {
	return r.options.Self()
}

func (r *Reader) sleep(delay time.Duration) {
	r.options.Sleep(delay)
}

func (r *Reader) ctx() sys.Context {
	if r.journal != nil {
		return r.journal
	}

	return silent{sys: r.options.Sys}
}

func (r *Reader) Context() sys.Context {
	return r.ctx()
}

func (r *Reader) Now() func() time.Time {
	return r.options.Now
}

func (r *Reader) registry() *registry.File {
	return registry.Load(r.ctx(), r.options.Paths)
}

func (r *Reader) hold() (func(), error) {
	release, err := lock.Hold(r.options.Paths.Lock, registryWait)
	if errors.Is(err, lock.ErrHeld) {
		return nil, protocol.NewError(contract.ErrorBusy, i18n.T("state.registry.busy")).
			WithFix(i18n.T("state.registry.busy.fix"))
	}

	return release, err
}

func (r *Reader) deferred() []string {
	if r.options.Deferred == nil {
		return nil
	}

	return r.options.Deferred()
}

func (r *Reader) domain() string {
	value, _, err := env.Get(r.ctx(), DomainKey)
	if err != nil {
		return ""
	}

	return value
}

func (r *Reader) license() contract.License {
	if r.options.License == nil {
		return contract.LicenseDev
	}

	return r.options.License()
}

type silent struct {
	sys sys.Sys
}

func (s silent) Sys() sys.Sys {
	return s.sys
}

func (s silent) Logf(string, ...any) {}

func (s silent) Once(key string, fn func() error) error {
	return fn()
}

func FromEngine(engine *modules.Engine, options Options) *Reader {
	if options.Sys == nil {
		options.Sys = engine.Sys
	}
	if options.Now == nil {
		options.Now = engine.Now
	}
	if options.Registry == nil {
		options.Registry = engine.Registry
	}
	if options.License == nil {
		options.License = engine.License
	}
	if options.AgentVersion == "" {
		options.AgentVersion = engine.AgentVersion
	}
	if options.InstallPath == "" {
		options.InstallPath = engine.InstallPath
	}
	if options.Deferred == nil {
		options.Deferred = engine.Deferred
	}
	if options.Command == nil {
		options.Command = engine.Command
	}

	return New(options)
}
