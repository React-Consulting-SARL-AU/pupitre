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

// Sleep stays nil unless a test sets it: a real follow waits on a timer it can leave the moment the channel is cut.
func (f FollowOptions) resolved() FollowOptions {
	if f.Interval == 0 {
		f.Interval = 250 * time.Millisecond
	}
	if f.Limit == 0 {
		f.Limit = 15 * time.Minute
	}

	return f
}

// How long a command waits its turn on the registry, the running record and /etc/hosts: their holders are gone in milliseconds.
const registryWait = 5 * time.Second

// DefaultInstallLock is the one lock an install, a sync or a pull takes: the
// second run on the same machine answers busy instead of racing the first in
// the same directories.
const DefaultInstallLock = "/var/lib/pupitre/project-install.lock"

type Options struct {
	Sys          sys.Sys
	Now          func() time.Time
	Registry     *modules.Registry
	Entitlement  func() contract.Entitlement
	AgentVersion string
	Paths        registry.Paths
	Tmux         tmux.Options
	// InstallLock guards a running install, sync or pull across sessions —
	// each channel is its own process, so only a file lock spans them; empty is
	// no lock, which the tests take.
	InstallLock string
	// InstallPath is the install.json the modules are read on, the one the engine writes; empty is the default path.
	InstallPath string
	// Deferred names the modules put on the machine without their settings: what
	// the contract calls unconfigured, and the one thing a module cannot tell of itself.
	Deferred func() []string
	// Command runs one action on a module under the run lock and the right of
	// use, as the engine runs install: what drives a unit takes the same door.
	Command func(id string, sink modules.Sink, fn func(*modules.Context) error) error
	Follow  FollowOptions
	Shots   ShotOptions
	Detect  DetectOptions
	Self    func() int
	Sleep   func(time.Duration)
	// GitTimeout bounds a git read — a status, a log, a diff — on a disk that stalls or a repository that has grown too large; zero is DefaultGitTimeout.
	GitTimeout time.Duration
}

const DefaultGitTimeout = 30 * time.Second

// The reader of the machine's state: the project registry, the tmux session and the installed modules, and nothing that writes on its own.
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

// One journal for the whole session: pupitred serve is long-lived, and reopening /var/log/pupitre.log on every snapshot would leak a descriptor a second.
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

// The shot command runs through the agent's own journal, where every other command already writes.
func (r *Reader) Context() sys.Context {
	return r.ctx()
}

func (r *Reader) Now() func() time.Time {
	return r.options.Now
}

func (r *Reader) registry() *registry.File {
	return registry.Load(r.ctx(), r.options.Paths)
}

// The lock the registry, the running record and /etc/hosts are read and written under, across every session of this machine.
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

func (r *Reader) entitlement() contract.Entitlement {
	if r.options.Entitlement == nil {
		return contract.EntitlementDev
	}

	return r.options.Entitlement()
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
	if options.Entitlement == nil {
		options.Entitlement = engine.Entitlement
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
