package migrate_test

import (
	"testing"

	"pupitre.studio/agent/internal/license"
	"pupitre.studio/agent/internal/migrate"
	"pupitre.studio/agent/internal/modules/modtest"
)

const (
	entitlementPath = "/var/lib/pupitre/entitlement.json"
	cachedRead      = `{"state":"valid","valid_until":"2026-09-12T10:00:00Z","checked_at":"2026-09-11T10:00:00Z","legacy":1}` + "\n"
)

func licenseCache() migrate.Migration {
	for _, migration := range migrate.All() {
		if migration.ID == 8 {
			return migration
		}
	}

	panic("no migration 8")
}

func atRevisionSeven(machine *modtest.FakeSys) {
	configured(machine)
	machine.Files[ledgerPath] = []byte(`{"revision":7,"applied":[]}`)
}

func TestLicenseCacheMovesTheLastReadOfThePlatformUnderItsNewName(t *testing.T) {
	machine := newSys()
	atRevisionSeven(machine)
	machine.Files[entitlementPath] = []byte(cachedRead)

	migration := licenseCache()
	if migration.Slug != "license-cache" || migration.Since != "2.0.0" || len(migration.Touches) != 2 {
		t.Fatalf("migration = %+v", migration)
	}

	result, err := runner(machine, migrate.All()...).Run()
	if err != nil || result.Failure != nil || len(result.Applied) != 1 || result.Applied[0].ID != 8 {
		t.Fatalf("result = %+v, err = %v, want the eighth migration alone", result, err)
	}

	if got := string(machine.Files[license.DefaultCachePath]); got != cachedRead {
		t.Fatalf("license.json = %q, want the old cache byte for byte, fields the code no longer names included", got)
	}

	if _, left := machine.Files[entitlementPath]; left {
		t.Fatal("entitlement.json must be gone")
	}

	if mode := machine.Modes[license.DefaultCachePath]; mode != 0o600 {
		t.Fatalf("license.json mode = %o, want 600", mode)
	}

	before := string(machine.Files[license.DefaultCachePath])

	if again, err := runner(machine, migrate.All()...).Run(); err != nil || len(again.Applied) != 0 || string(machine.Files[license.DefaultCachePath]) != before {
		t.Fatal("a second pass must change nothing")
	}
}

func TestLicenseCacheKeepsWhatAnInterruptedRunAlreadyWrote(t *testing.T) {
	machine := newSys()
	atRevisionSeven(machine)
	machine.Files[entitlementPath] = []byte(`{"state":"suspended"}`)
	machine.Files[license.DefaultCachePath] = []byte(cachedRead)

	if _, err := runner(machine, migrate.All()...).Run(); err != nil {
		t.Fatalf("Run: %v", err)
	}

	if got := string(machine.Files[license.DefaultCachePath]); got != cachedRead {
		t.Fatalf("license.json = %q, want the one already written", got)
	}

	if _, left := machine.Files[entitlementPath]; left {
		t.Fatal("entitlement.json must be gone")
	}
}

func TestLicenseCacheLeavesAServerThatNeverReadThePlatformAlone(t *testing.T) {
	machine := newSys()
	atRevisionSeven(machine)

	result, err := runner(machine, migrate.All()...).Run()
	if err != nil || len(result.Applied) != 1 {
		t.Fatalf("result = %+v, err = %v", result, err)
	}

	if _, written := machine.Files[license.DefaultCachePath]; written {
		t.Fatal("no cache, nothing to carry")
	}
}
