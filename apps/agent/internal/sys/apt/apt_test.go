package apt_test

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/apt"
)

var lockOptions = []string{"-o", "DPkg::Lock::Timeout=600", "-o", "Dpkg::Use-Pty=0"}

func TestInstallWaitsForTheLockAndUpdatesOnce(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	if err := apt.Install(ctx, "redis-server"); err != nil {
		t.Fatal(err)
	}

	if err := apt.Install(ctx, "curl", "jq"); err != nil {
		t.Fatal(err)
	}

	if fake.Updates != 1 {
		t.Fatalf("apt-get update ran %d times, want 1", fake.Updates)
	}

	update := fake.Calls[0]
	install := fake.Calls[1]

	wantUpdate := append(append([]string{"apt-get"}, lockOptions...), "update", "-qq")
	if !reflect.DeepEqual(update.Argv, wantUpdate) {
		t.Fatalf("update argv = %v", update.Argv)
	}

	wantInstall := append(append([]string{"apt-get"}, lockOptions...), "install", "-y", "-qq", "redis-server")
	if !reflect.DeepEqual(install.Argv, wantInstall) {
		t.Fatalf("install argv = %v", install.Argv)
	}

	for _, call := range fake.Calls[:2] {
		if !reflect.DeepEqual(call.Env, []string{"DEBIAN_FRONTEND=noninteractive"}) {
			t.Fatalf("env = %v", call.Env)
		}
	}

	if fake.Packages["redis-server"] == "" || fake.Packages["curl"] == "" || fake.Packages["jq"] == "" {
		t.Fatalf("packages = %v", fake.Packages)
	}
}

func TestInstalledAndVersion(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Packages["redis-server"] = "7.0.15"
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	if !apt.Installed(ctx, "redis-server") || apt.Installed(ctx, "mysql-server") {
		t.Fatal("Installed answers wrong")
	}

	version, err := apt.Version(ctx, "redis-server")
	if err != nil || version != "7.0.15" {
		t.Fatalf("Version = %q, %v", version, err)
	}

	if _, err := apt.Version(ctx, "mysql-server"); err == nil {
		t.Fatal("Version of an absent package must fail")
	}

	if len(fake.Mutations) != 0 {
		t.Fatalf("read-only helpers mutated the machine: %v", fake.Mutations)
	}
}

func TestUpgradeReportsWhetherTheVersionChanged(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Packages["redis-server"] = "7.0.15"
	fake.Upgrades["redis-server"] = "7.2.4"
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	upgraded, err := apt.Upgrade(ctx, "redis-server")
	if err != nil || !upgraded {
		t.Fatalf("Upgrade = %v, %v", upgraded, err)
	}

	upgraded, err = apt.Upgrade(ctx, "redis-server")
	if err != nil || upgraded {
		t.Fatalf("second Upgrade = %v, %v", upgraded, err)
	}

	if fake.Packages["redis-server"] != "7.2.4" {
		t.Fatalf("version = %s", fake.Packages["redis-server"])
	}
}

func TestRemoveAndFailures(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Packages["redis-server"] = "7.0.15"
	fake.FailPackage("nope", "E: Unable to locate package nope")
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	if err := apt.Remove(ctx, "redis-server"); err != nil {
		t.Fatal(err)
	}

	if _, present := fake.Packages["redis-server"]; present {
		t.Fatal("package still present")
	}

	err := apt.Install(ctx, "nope")

	var exit *sys.ExitError
	if !errors.As(err, &exit) || exit.Code != 100 || !strings.Contains(err.Error(), "Unable to locate package nope") {
		t.Fatalf("unexpected error %v", err)
	}

	output := strings.Join(ctx.Output(), "\n")
	if !strings.Contains(output, "$ apt-get") || !strings.Contains(output, "Unable to locate package nope") {
		t.Fatalf("journal must carry the command and its output:\n%s", output)
	}
}
