package entitlement

import (
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/platform"
	"pupitre.studio/agent/internal/sys"
)

const (
	DefaultCachePath = "/var/lib/pupitre/entitlement.json"
	DefaultTolerance = 7 * 24 * time.Hour
)

// enroll is admitted because it is the gesture that repairs a restricted server, and a token the platform signs for an authenticated account opens nothing that account could not already obtain.
var RestrictedCommands = []string{"hello", "ping", "snapshot", "status", "diag", "agent.upgrade", "enroll", "platform.sync"}

// A binary copied onto a server that was never enrolled has no state to show and no server to upgrade: it says who it is, answers a ping, hands out a diagnostic, and takes the enrolment that gives it a server.
var UnenrolledCommands = []string{"hello", "ping", "diag", "enroll"}

type State struct {
	Entitlement contract.Entitlement
	Enrolled    bool
}

func (s State) Allows(cmd string) bool {
	if s.Entitlement == contract.EntitlementDev {
		return true
	}

	if !s.Enrolled {
		return AllowedWithoutEnrolment(cmd)
	}

	if s.Entitlement == contract.EntitlementRestricted {
		return AllowedInRestrictedMode(cmd)
	}

	return true
}

// A fixed entitlement, for the callers that already hold one rather than resolving it from the disk.
func Fixed(granted contract.Entitlement) func() State {
	return func() State { return State{Entitlement: granted, Enrolled: true} }
}

func Current() contract.Entitlement {
	return buildEntitlement
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

// The entitlement as the machine alone can tell it: the token on its disk and the last answer of the platform, never the network.
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
	if buildEntitlement == contract.EntitlementDev {
		return State{Entitlement: contract.EntitlementDev, Enrolled: true}
	}

	if r.options.Sys == nil || !platform.Enrolled(r.options.Sys, r.options.TokenPath) {
		return State{Entitlement: contract.EntitlementRestricted}
	}

	cache, err := ReadCache(r.options.Sys, r.options.CachePath)
	if err != nil {
		return State{Entitlement: contract.EntitlementRestricted, Enrolled: true}
	}

	return State{Entitlement: cache.Resolve(r.options.Now(), r.options.Tolerance), Enrolled: true}
}

func (r *Resolver) Current() contract.Entitlement {
	return r.State().Entitlement
}

func (r *Resolver) Remember(state platform.State) error {
	return WriteCache(r.options.Sys, r.options.CachePath, Cache{
		State:      state.Entitlement,
		ValidUntil: state.ValidUntil,
		CheckedAt:  r.options.Now(),
	})
}

func (r *Resolver) SyncedAt() time.Time {
	cache, err := ReadCache(r.options.Sys, r.options.CachePath)
	if err != nil {
		return time.Time{}
	}

	return cache.CheckedAt
}
