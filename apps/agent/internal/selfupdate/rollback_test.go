package selfupdate_test

import (
	"path/filepath"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/migrate"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/selfupdate"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/lock"
)

const (
	installPath = "/etc/pupitre/install.json"
	ledgerPath  = "/etc/pupitre/migrations.json"
	backupsPath = "/var/lib/pupitre/config-backups"
	unshaped    = `{"modules":["core.system"],"config":{"core.system":{"tz":"UTC"}}}` + "\n"
	reshaped    = `{"modules":["core.system"],"config":{"core.system":{"timezone":"UTC"}}}` + "\n"
)

var (
	shipped = migrate.Migration{ID: 1, Slug: "shipped", Touches: []migrate.Target{migrate.TargetInstall}, Apply: func(*migrate.Context) error { return nil }}
	coming  = migrate.Migration{ID: 2, Slug: "rename-timezone", Touches: []migrate.Target{migrate.TargetInstall}, Apply: func(ctx *migrate.Context) error {
		return ctx.Write(migrate.TargetInstall, []byte(reshaped))
	}}
)

func runner(fake *modtest.FakeSys, migrations ...migrate.Migration) *migrate.Runner {
	return migrate.New(migrate.Options{
		Sys:        fake,
		Migrations: migrations,
		Paths:      migrate.Paths{Install: installPath, Ledger: ledgerPath, Backups: backupsPath},
	})
}

// migrating puts a configuration at revision 1 on the bench, gives the running agent its ledger, and has the new binary migrate to revision 2 the moment its unit starts, as the daemon does.
func (b *bench) migrating(t *testing.T) *migrate.Runner {
	t.Helper()

	b.fake.Files[installPath] = []byte(unshaped)
	b.fake.Files[ledgerPath] = []byte(`{"revision":1,"applied":[]}` + "\n")

	running := runner(b.fake, shipped)
	next := runner(b.fake, shipped, coming)
	b.options.Migrator = running

	b.fake.Observe = func(cmd sys.Command) {
		if strings.Join(cmd.Argv, " ") != "systemctl restart "+unit || string(b.fake.Files[binaryPath]) != string(newBinary) {
			return
		}

		if result, err := next.Run(); err != nil || result.Revision != 2 {
			t.Fatalf("the new binary did not migrate: %+v, %v", result, err)
		}
	}

	return running
}

func TestASuccessfulUpgradeKeepsTheConfigurationTheNewBinaryMigrated(t *testing.T) {
	b := newBench(t)
	running := b.migrating(t)

	if _, err := b.upgrade(t, nextAgent); err != nil {
		t.Fatalf("Upgrade: %v", err)
	}

	if running.Ledger().Revision != 2 || string(b.fake.Files[installPath]) != reshaped {
		t.Fatalf("revision %d, install.json %q", running.Ledger().Revision, b.fake.Files[installPath])
	}
}

func TestAFailedHelloPutsTheMigratedConfigurationBackWithTheBinary(t *testing.T) {
	b := newBench(t)
	running := b.migrating(t)
	b.fake.Replies[binaryPath+" serve"] = hello(false, "", "internal")

	_, err := b.upgrade(t, nextAgent)
	if code := codeOf(t, err); code != contract.ErrorInternal {
		t.Fatalf("code = %s, error = %v", code, err)
	}

	if string(b.fake.Files[binaryPath]) != string(oldBinary) {
		t.Fatalf("binary in place: %q", b.fake.Files[binaryPath])
	}

	if running.Ledger().Revision != 1 || string(b.fake.Files[installPath]) != unshaped {
		t.Fatalf("the configuration must be back at revision 1: revision %d, install.json %q", running.Ledger().Revision, b.fake.Files[installPath])
	}

	if state := running.State(); state.State != contract.ConfigCurrent {
		t.Fatalf("the previous agent must read its configuration again: %+v", state)
	}

	if b.fake.Restarts[unit] != 2 {
		t.Fatalf("restarts of %s: %d", unit, b.fake.Restarts[unit])
	}
}

func TestAFailedHelloWithoutAMigrationLeavesTheConfigurationAlone(t *testing.T) {
	b := newBench(t)
	b.fake.Files[installPath] = []byte(unshaped)
	b.fake.Files[ledgerPath] = []byte(`{"revision":1,"applied":[]}` + "\n")
	b.options.Migrator = runner(b.fake, shipped)
	b.fake.Replies[binaryPath+" serve"] = hello(false, "", "internal")

	_, err := b.upgrade(t, nextAgent)
	if code := codeOf(t, err); code != contract.ErrorInternal || strings.Contains(err.Error(), "migrate") {
		t.Fatalf("code = %s, error = %v", code, err)
	}

	if string(b.fake.Files[installPath]) != unshaped {
		t.Fatalf("install.json = %q", b.fake.Files[installPath])
	}
}

func TestASecondUpgradeIsRefusedWhileTheFirstRuns(t *testing.T) {
	b := newBench(t)
	b.options.UpgradeLock = filepath.Join(t.TempDir(), "upgrade.lock")

	var second error
	b.fake.Observe = func(cmd sys.Command) {
		if strings.Join(cmd.Argv, " ") == "systemctl restart "+unit && second == nil {
			_, second = selfupdate.New(b.options).Upgrade(selfupdate.Request{Version: nextAgent})
		}
	}

	if _, err := b.upgrade(t, nextAgent); err != nil {
		t.Fatalf("Upgrade: %v", err)
	}

	if code := codeOf(t, second); code != contract.ErrorBusy {
		t.Fatalf("the second upgrade = %v, want busy", second)
	}

	if b.fake.Restarts[unit] != 1 {
		t.Fatalf("restarts of %s: %d", unit, b.fake.Restarts[unit])
	}

	b.fake.Observe = nil
	b.fake.Files[binaryPath] = append([]byte(nil), oldBinary...)
	if _, err := b.upgrade(t, nextAgent); err != nil {
		t.Fatalf("the lock must be released once an upgrade is over: %v", err)
	}
}

func TestAnUpgradeWaitsForTheBackupOrInstallUnderWay(t *testing.T) {
	b := newBench(t)
	b.options.InstallLock = filepath.Join(t.TempDir(), "install.lock")

	release, held, err := lock.Acquire(b.options.InstallLock)
	if err != nil || !held {
		t.Fatalf("Acquire: %v, %v", held, err)
	}

	before := snapshot(b.fake)

	_, err = b.upgrade(t, nextAgent)
	if code := codeOf(t, err); code != contract.ErrorBusy {
		t.Fatalf("code = %s, error = %v", code, err)
	}

	assertUntouched(t, b, before)

	release()

	if _, err := b.upgrade(t, nextAgent); err != nil {
		t.Fatalf("Upgrade once the lock is free: %v", err)
	}

	again, held, err := lock.Acquire(b.options.InstallLock)
	if err != nil || !held {
		t.Fatalf("the upgrade must let go of the install lock: %v, %v", held, err)
	}
	again()
}
