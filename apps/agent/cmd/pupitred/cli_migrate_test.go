package main

import (
	"bytes"
	"path/filepath"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/migrate"
	"pupitre.studio/agent/internal/modules/modtest"
)

func migrator(t *testing.T, machine *modtest.FakeSys, migrations ...migrate.Migration) *migrate.Runner {
	t.Helper()

	dir := t.TempDir()

	return migrate.New(migrate.Options{
		AgentVersion: "test",
		Migrations:   migrations,
		Paths: migrate.Paths{
			Backups: filepath.Join(dir, "backups"),
			Install: "/etc/pupitre/install.json",
			Ledger:  filepath.Join(dir, "migrations.json"),
		},
		Sys: machine,
	})
}

func touching(id int) migrate.Migration {
	return migrate.Migration{
		Apply: func(ctx *migrate.Context) error {
			return ctx.Write(migrate.TargetProjects, []byte("migrated\n"))
		},
		ID:      id,
		Slug:    "touches-projects",
		Touches: []migrate.Target{migrate.TargetProjects},
	}
}

func TestMigrateSaysWhenThereIsNothingToDo(t *testing.T) {
	t.Setenv("PUPITRE_LOCALE", "en")

	var stdout, stderr bytes.Buffer
	code := runMigrate(migrator(t, modtest.NewFakeSys()), nil, &stdout, &stderr)

	if code != 0 {
		t.Fatalf("code = %d, stderr = %q", code, stderr.String())
	}

	if !strings.Contains(stdout.String(), "nothing to do") {
		t.Fatalf("stdout = %q", stdout.String())
	}
}

func TestMigrateRunsWhatTheMachineOwes(t *testing.T) {
	t.Setenv("PUPITRE_LOCALE", "en")

	machine := modtest.NewFakeSys()
	machine.Files["/etc/pupitre/install.json"] = []byte(`{"modules":[]}`)

	var stdout, stderr bytes.Buffer
	code := runMigrate(migrator(t, machine, touching(1)), nil, &stdout, &stderr)

	if code != 0 {
		t.Fatalf("code = %d, stderr = %q", code, stderr.String())
	}

	if !strings.Contains(stdout.String(), "revision 1") {
		t.Fatalf("stdout = %q", stdout.String())
	}
}

func TestMigrateStatusFailsWhenTheMachineIsBehind(t *testing.T) {
	t.Setenv("PUPITRE_LOCALE", "en")

	machine := modtest.NewFakeSys()
	machine.Files["/etc/pupitre/install.json"] = []byte(`{"modules":[]}`)

	var stdout, stderr bytes.Buffer
	code := runMigrate(migrator(t, machine, touching(1)), []string{"--status"}, &stdout, &stderr)

	if code != 1 {
		t.Fatalf("code = %d, want a status that says the machine is behind", code)
	}

	printed := stdout.String()
	if !strings.Contains(printed, "revision 0, expected 1") {
		t.Fatalf("stdout = %q", printed)
	}

	if !strings.Contains(printed, "touches-projects") {
		t.Fatalf("stdout = %q, want the migration still owed", printed)
	}
}

func TestMigrateRefusesAnArgumentNobodyDefined(t *testing.T) {
	t.Setenv("PUPITRE_LOCALE", "en")

	var stdout, stderr bytes.Buffer
	code := runMigrate(migrator(t, modtest.NewFakeSys()), []string{"--force"}, &stdout, &stderr)

	if code != 2 {
		t.Fatalf("code = %d, want the usage", code)
	}

	if !strings.Contains(stderr.String(), "--force") {
		t.Fatalf("stderr = %q", stderr.String())
	}
}
