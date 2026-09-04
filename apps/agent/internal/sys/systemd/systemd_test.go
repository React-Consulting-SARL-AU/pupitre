package systemd_test

import (
	"reflect"
	"testing"

	"pupitre.sh/agent/internal/contract"
	"pupitre.sh/agent/internal/modules/modtest"
	"pupitre.sh/agent/internal/sys/systemd"
)

func TestEnableRestartAndState(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Units["redis-server"] = modtest.UnitInactive
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	if systemd.Active(ctx, "redis-server") {
		t.Fatal("inactive unit reported active")
	}

	if state := systemd.State(ctx, "redis-server"); state != contract.ServiceStopped {
		t.Fatalf("State = %s, want stopped", state)
	}

	if err := systemd.Enable(ctx, "redis-server"); err != nil {
		t.Fatal(err)
	}

	if !reflect.DeepEqual(fake.Calls[len(fake.Calls)-1].Argv, []string{"systemctl", "enable", "--now", "redis-server"}) {
		t.Fatalf("argv = %v", fake.Calls[len(fake.Calls)-1].Argv)
	}

	if !systemd.Active(ctx, "redis-server") || systemd.State(ctx, "redis-server") != contract.ServiceRunning {
		t.Fatal("enabled unit must be active")
	}

	if err := systemd.Restart(ctx, "redis-server"); err != nil {
		t.Fatal(err)
	}

	if fake.Restarts["redis-server"] != 1 {
		t.Fatalf("restarts = %d", fake.Restarts["redis-server"])
	}

	if err := systemd.Restart(ctx, "ghost"); err == nil {
		t.Fatal("restarting an unknown unit must fail")
	}

	fake.Units["redis-server"] = modtest.UnitFailed
	if systemd.State(ctx, "redis-server") != contract.ServiceFailed {
		t.Fatal("failed state not mapped")
	}

	if err := systemd.Disable(ctx, "redis-server"); err != nil {
		t.Fatal(err)
	}

	if fake.Units["redis-server"] != modtest.UnitInactive {
		t.Fatalf("unit = %s after disable", fake.Units["redis-server"])
	}
}

func TestWriteUnitReloadsTheDaemon(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	if err := systemd.WriteUnit(ctx, "pupitre-gallery", []byte("[Unit]\n")); err != nil {
		t.Fatal(err)
	}

	if string(fake.Files["/etc/systemd/system/pupitre-gallery.service"]) != "[Unit]\n" || fake.Modes["/etc/systemd/system/pupitre-gallery.service"] != 0o644 {
		t.Fatalf("unit file not written: %v", fake.Files)
	}

	if !reflect.DeepEqual(fake.Calls[len(fake.Calls)-1].Argv, []string{"systemctl", "daemon-reload"}) {
		t.Fatalf("daemon-reload missing: %v", fake.Commands())
	}
}
