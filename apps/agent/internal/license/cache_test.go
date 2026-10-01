//go:build !dev

package license_test

import (
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/license"
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

func resolver(fake *modtest.FakeSys, now *time.Time) *license.Resolver {
	return license.New(license.Options{Sys: fake, Now: func() time.Time { return *now }})
}

func TestCacheResolvesTheTwentyFourHoursThenTheTolerance(t *testing.T) {
	cache := license.Cache{State: "valid", ValidUntil: enrolledAt.Add(24 * time.Hour), CheckedAt: enrolledAt}

	for _, want := range []struct {
		at    time.Time
		state contract.License
	}{
		{enrolledAt, contract.LicenseValid},
		{enrolledAt.Add(23 * time.Hour), contract.LicenseValid},
		{enrolledAt.Add(25 * time.Hour), contract.LicenseGrace},
		{day(6), contract.LicenseGrace},
		{day(8), contract.LicenseRestricted},
	} {
		if got := cache.Resolve(want.at, license.DefaultTolerance); got != want.state {
			t.Errorf("at %s: %s, want %s", want.at, got, want.state)
		}
	}
}

func TestCacheFollowsTheStateThePlatformGave(t *testing.T) {
	suspended := license.Cache{State: "suspended", ValidUntil: enrolledAt.Add(24 * time.Hour), CheckedAt: enrolledAt}
	if got := suspended.Resolve(enrolledAt, license.DefaultTolerance); got != contract.LicenseRestricted {
		t.Errorf("suspendu = %s", got)
	}

	grace := license.Cache{State: "grace", ValidUntil: enrolledAt.Add(24 * time.Hour), CheckedAt: enrolledAt}
	if got := grace.Resolve(enrolledAt, license.DefaultTolerance); got != contract.LicenseGrace {
		t.Errorf("grace = %s", got)
	}
}

func TestSevenDaysWithoutThePlatformCloseTheAgent(t *testing.T) {
	fake := enrolledMachine()
	now := enrolledAt
	resolved := resolver(fake, &now)

	if err := resolved.Remember(platform.State{License: "valid", ValidUntil: enrolledAt.Add(24 * time.Hour)}); err != nil {
		t.Fatalf("Remember: %v", err)
	}

	now = day(6)
	state := resolved.State()
	if state.License == contract.LicenseRestricted {
		t.Fatalf("on the sixth day: %s", state.License)
	}

	if !state.Allows("install") || !state.Allows("project.up") {
		t.Fatal("on the sixth day, install and project.up should answer")
	}

	now = day(8)
	state = resolved.State()
	if state.License != contract.LicenseRestricted {
		t.Fatalf("on the eighth day: %s", state.License)
	}

	if state.Allows("install") {
		t.Fatal("on the eighth day, install should refuse")
	}

	for _, cmd := range license.RestrictedCommands {
		if !state.Allows(cmd) {
			t.Errorf("%s should answer in restricted mode", cmd)
		}
	}
}

func TestASuccessfulReadPushesTheDeadline(t *testing.T) {
	fake := enrolledMachine()
	now := enrolledAt
	resolved := resolver(fake, &now)

	resolved.Remember(platform.State{License: "valid", ValidUntil: enrolledAt.Add(24 * time.Hour)})

	now = day(5)
	resolved.Remember(platform.State{License: "valid", ValidUntil: day(5).Add(24 * time.Hour)})

	now = day(11)
	if got := resolved.Current(); got != contract.LicenseGrace {
		t.Fatalf("eleventh day = %s", got)
	}

	now = day(13)
	if got := resolved.Current(); got != contract.LicenseRestricted {
		t.Fatalf("thirteenth day = %s", got)
	}
}

func TestAnEnrolledServerWithoutACacheStaysRestricted(t *testing.T) {
	now := enrolledAt
	state := resolver(enrolledMachine(), &now).State()

	if state.License != contract.LicenseRestricted || !state.Enrolled {
		t.Fatalf("state = %+v", state)
	}
}

func TestABinaryWithoutATokenAnswersThreeCommands(t *testing.T) {
	now := enrolledAt
	state := resolver(modtest.NewFakeSys(), &now).State()

	if state.Enrolled || state.License != contract.LicenseRestricted {
		t.Fatalf("state = %+v", state)
	}

	for _, cmd := range []string{"hello", "ping", "diag"} {
		if !state.Allows(cmd) {
			t.Errorf("%s should answer", cmd)
		}
	}

	for _, cmd := range []string{"snapshot", "status", "agent.upgrade", "install", "probe", "keys.sync", "project.up"} {
		if state.Allows(cmd) {
			t.Errorf("%s should refuse without a token", cmd)
		}
	}
}

func TestRememberWritesForRootAlone(t *testing.T) {
	fake := enrolledMachine()
	now := enrolledAt
	resolved := resolver(fake, &now)

	resolved.Remember(platform.State{License: "valid", ValidUntil: enrolledAt.Add(24 * time.Hour)})

	if mode := fake.Modes[license.DefaultCachePath]; mode != 0o600 {
		t.Fatalf("mode = %o", mode)
	}

	if !resolved.SyncedAt().Equal(enrolledAt) {
		t.Fatalf("SyncedAt = %s", resolved.SyncedAt())
	}
}

func TestAnUnreadableCacheRestrictsRatherThanOpens(t *testing.T) {
	fake := enrolledMachine()
	fake.Files[license.DefaultCachePath] = []byte("{ not json")
	now := enrolledAt

	if got := resolver(fake, &now).Current(); got != contract.LicenseRestricted {
		t.Fatalf("cache illisible = %s", got)
	}
}
