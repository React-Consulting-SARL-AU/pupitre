//go:build !dev

package entitlement_test

import (
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/platform"
)

var enrolledAt = time.Date(2026, time.September, 4, 12, 0, 0, 0, time.UTC)

func day(n int) time.Time {
	return enrolledAt.Add(time.Duration(n) * 24 * time.Hour)
}

func enrolledMachine() *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Files[platform.DefaultTokenPath] = []byte("jeton-de-serveur\n")

	return fake
}

func resolver(fake *modtest.FakeSys, now *time.Time) *entitlement.Resolver {
	return entitlement.New(entitlement.Options{Sys: fake, Now: func() time.Time { return *now }})
}

func TestCacheResolvesTheTwentyFourHoursThenTheTolerance(t *testing.T) {
	cache := entitlement.Cache{State: "valid", ValidUntil: enrolledAt.Add(24 * time.Hour), CheckedAt: enrolledAt}

	for _, want := range []struct {
		at    time.Time
		state contract.Entitlement
	}{
		{enrolledAt, contract.EntitlementValid},
		{enrolledAt.Add(23 * time.Hour), contract.EntitlementValid},
		{enrolledAt.Add(25 * time.Hour), contract.EntitlementGrace},
		{day(6), contract.EntitlementGrace},
		{day(8), contract.EntitlementRestricted},
	} {
		if got := cache.Resolve(want.at, entitlement.DefaultTolerance); got != want.state {
			t.Errorf("à %s : %s, attendu %s", want.at, got, want.state)
		}
	}
}

func TestCacheFollowsTheStateThePlatformGave(t *testing.T) {
	suspended := entitlement.Cache{State: "suspended", ValidUntil: enrolledAt.Add(24 * time.Hour), CheckedAt: enrolledAt}
	if got := suspended.Resolve(enrolledAt, entitlement.DefaultTolerance); got != contract.EntitlementRestricted {
		t.Errorf("suspendu = %s", got)
	}

	grace := entitlement.Cache{State: "grace", ValidUntil: enrolledAt.Add(24 * time.Hour), CheckedAt: enrolledAt}
	if got := grace.Resolve(enrolledAt, entitlement.DefaultTolerance); got != contract.EntitlementGrace {
		t.Errorf("tolérance = %s", got)
	}
}

// Six days unreachable and everything answers; on the eighth the agent restricts itself, on a clock the test moves by hand.
func TestSevenDaysWithoutThePlatformCloseTheAgent(t *testing.T) {
	fake := enrolledMachine()
	now := enrolledAt
	resolved := resolver(fake, &now)

	if err := resolved.Remember(platform.State{Entitlement: "valid", ValidUntil: enrolledAt.Add(24 * time.Hour)}); err != nil {
		t.Fatalf("Remember: %v", err)
	}

	now = day(6)
	state := resolved.State()
	if state.Entitlement == contract.EntitlementRestricted {
		t.Fatalf("au sixième jour : %s", state.Entitlement)
	}

	if !state.Allows("install") || !state.Allows("project.up") {
		t.Fatal("au sixième jour, install et project.up devraient répondre")
	}

	now = day(8)
	state = resolved.State()
	if state.Entitlement != contract.EntitlementRestricted {
		t.Fatalf("au huitième jour : %s", state.Entitlement)
	}

	if state.Allows("install") {
		t.Fatal("au huitième jour, install devrait refuser")
	}

	for _, cmd := range entitlement.RestrictedCommands {
		if !state.Allows(cmd) {
			t.Errorf("%s devrait répondre en mode restreint", cmd)
		}
	}
}

// The seven days count from the last successful read, not from the enrolment: a platform back on the fifth day pushes the deadline.
func TestASuccessfulReadPushesTheDeadline(t *testing.T) {
	fake := enrolledMachine()
	now := enrolledAt
	resolved := resolver(fake, &now)

	resolved.Remember(platform.State{Entitlement: "valid", ValidUntil: enrolledAt.Add(24 * time.Hour)})

	now = day(5)
	resolved.Remember(platform.State{Entitlement: "valid", ValidUntil: day(5).Add(24 * time.Hour)})

	now = day(11)
	if got := resolved.Current(); got != contract.EntitlementGrace {
		t.Fatalf("onzième jour = %s", got)
	}

	now = day(13)
	if got := resolved.Current(); got != contract.EntitlementRestricted {
		t.Fatalf("treizième jour = %s", got)
	}
}

func TestAnEnrolledServerWithoutACacheStaysRestricted(t *testing.T) {
	now := enrolledAt
	state := resolver(enrolledMachine(), &now).State()

	if state.Entitlement != contract.EntitlementRestricted || !state.Enrolled {
		t.Fatalf("state = %+v", state)
	}
}

// A binary copied onto another server carries no token: hello, ping and diag, and not one command more.
func TestABinaryWithoutATokenAnswersThreeCommands(t *testing.T) {
	now := enrolledAt
	state := resolver(modtest.NewFakeSys(), &now).State()

	if state.Enrolled || state.Entitlement != contract.EntitlementRestricted {
		t.Fatalf("state = %+v", state)
	}

	for _, cmd := range []string{"hello", "ping", "diag"} {
		if !state.Allows(cmd) {
			t.Errorf("%s devrait répondre", cmd)
		}
	}

	for _, cmd := range []string{"snapshot", "status", "agent.upgrade", "install", "probe", "keys.sync", "project.up"} {
		if state.Allows(cmd) {
			t.Errorf("%s devrait refuser sans jeton", cmd)
		}
	}
}

func TestRememberWritesForRootAlone(t *testing.T) {
	fake := enrolledMachine()
	now := enrolledAt
	resolved := resolver(fake, &now)

	resolved.Remember(platform.State{Entitlement: "valid", ValidUntil: enrolledAt.Add(24 * time.Hour)})

	if mode := fake.Modes[entitlement.DefaultCachePath]; mode != 0o600 {
		t.Fatalf("mode = %o", mode)
	}

	if !resolved.SyncedAt().Equal(enrolledAt) {
		t.Fatalf("SyncedAt = %s", resolved.SyncedAt())
	}
}

func TestAnUnreadableCacheRestrictsRatherThanOpens(t *testing.T) {
	fake := enrolledMachine()
	fake.Files[entitlement.DefaultCachePath] = []byte("{ pas du json")
	now := enrolledAt

	if got := resolver(fake, &now).Current(); got != contract.EntitlementRestricted {
		t.Fatalf("cache illisible = %s", got)
	}
}
