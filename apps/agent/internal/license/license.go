package license

import (
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/platform"
	"pupitre.studio/agent/internal/sys"
)

const (
	DefaultCachePath = "/var/lib/pupitre/license.json"
	DefaultTolerance = 7 * 24 * time.Hour
)

// enroll stays open: it repairs a restricted server and grants nothing the account could not already get.
var RestrictedCommands = contract.Enum("RestrictedCommands")

var UnenrolledCommands = contract.Enum("UnenrolledCommands")

type State struct {
	License  contract.License
	Enrolled bool
}

func (s State) Allows(cmd string) bool {
	if s.License == contract.LicenseDev {
		return true
	}

	if !s.Enrolled {
		return AllowedWithoutEnrolment(cmd)
	}

	if s.License == contract.LicenseRestricted {
		return AllowedInRestrictedMode(cmd)
	}

	return true
}

func Fixed(granted contract.License) func() State {
	return func() State { return State{License: granted, Enrolled: true} }
}

func Current() contract.License {
	return buildLicense
}

func AllowedInRestrictedMode(cmd string) bool {
	return listed(RestrictedCommands, cmd)
}

func AllowedWithoutEnrolment(cmd string) bool {
	return listed(UnenrolledCommands, cmd)
}

func listed(commands []string, cmd string) bool {
	for _, allowed := range commands {
		if allowed == cmd {
			return true
		}
	}

	return false
}

type Options struct {
	Sys       sys.Sys
	Now       func() time.Time
	CachePath string
	TokenPath string
	Tolerance time.Duration
}

// Resolved from disk alone, the token and the platform's last answer, never the network.
type Resolver struct {
	options Options
}

func New(options Options) *Resolver {
	if options.Now == nil {
		options.Now = time.Now
	}
	if options.CachePath == "" {
		options.CachePath = DefaultCachePath
	}
	if options.TokenPath == "" {
		options.TokenPath = platform.DefaultTokenPath
	}
	if options.Tolerance == 0 {
		options.Tolerance = DefaultTolerance
	}

	return &Resolver{options: options}
}

func (r *Resolver) State() State {
	if buildLicense == contract.LicenseDev {
		return State{License: contract.LicenseDev, Enrolled: true}
	}

	if r.options.Sys == nil || !platform.Enrolled(r.options.Sys, r.options.TokenPath) {
		return State{License: contract.LicenseRestricted}
	}

	cache, err := ReadCache(r.options.Sys, r.options.CachePath)
	if err != nil {
		return State{License: contract.LicenseRestricted, Enrolled: true}
	}

	return State{License: cache.Resolve(r.options.Now(), r.options.Tolerance), Enrolled: true}
}

func (r *Resolver) Current() contract.License {
	return r.State().License
}

func (r *Resolver) Remember(state platform.State) error {
	return WriteCache(r.options.Sys, r.options.CachePath, Cache{
		State:      state.License,
		ValidUntil: state.ValidUntil,
		CheckedAt:  r.options.Now(),
	})
}

func (r *Resolver) Suspend() error {
	return WriteCache(r.options.Sys, r.options.CachePath, Cache{
		State:     platformSuspended,
		CheckedAt: r.options.Now(),
	})
}

func (r *Resolver) SyncedAt() time.Time {
	cache, err := ReadCache(r.options.Sys, r.options.CachePath)
	if err != nil {
		return time.Time{}
	}

	return cache.CheckedAt
}
