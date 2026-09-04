package state

import (
	"os"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/tmux"
)

const DomainKey = "PUPITRE_DOMAIN"

type FollowOptions struct {
	Interval time.Duration
	Limit    time.Duration
	Sleep    func(time.Duration)
}

func (f FollowOptions) resolved() FollowOptions {
	if f.Interval == 0 {
		f.Interval = 250 * time.Millisecond
	}
	if f.Limit == 0 {
		f.Limit = 15 * time.Minute
	}
	if f.Sleep == nil {
		f.Sleep = time.Sleep
	}

	return f
}

type Options struct {
	Sys          sys.Sys
	Now          func() time.Time
	Registry     *modules.Registry
	Entitlement  func() contract.Entitlement
	AgentVersion string
	Paths        registry.Paths
	Tmux         tmux.Options
	Follow       FollowOptions
	Shots        ShotOptions
	Self         func() int
	Sleep        func(time.Duration)
}

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
	if options.Tmux.Now == nil {
		options.Tmux.Now = options.Now
	}
	options.Tmux = options.Tmux.Resolved()
	options.Shots = options.Shots.resolved(options.Tmux.User)
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

func (r *Reader) registry() *registry.File {
	return registry.Load(r.ctx(), r.options.Paths)
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

	return New(options)
}
