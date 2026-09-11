package migrate_test

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/migrate"
	"pupitre.studio/agent/internal/modules/modtest"
)

const (
	ledgerPath   = "/etc/pupitre/migrations.json"
	installPath  = "/etc/pupitre/install.json"
	projectsPath = "/etc/pupitre/projects.local.json"
	legacyPath   = "/etc/pupitre/projects.local.conf"
	envPath      = "/etc/pupitre/env"
	backupsPath  = "/var/lib/pupitre/config-backups"
)

func newSys() *modtest.FakeSys {
	machine := modtest.NewFakeSys()
	machine.Now = time.Date(2026, 9, 11, 10, 0, 0, 0, time.UTC)

	return machine
}

func runner(machine *modtest.FakeSys, migrations ...migrate.Migration) *migrate.Runner {
	return keeping(machine, 0, migrations...)
}

func keeping(machine *modtest.FakeSys, keep int, migrations ...migrate.Migration) *migrate.Runner {
	return migrate.New(migrate.Options{
		AgentVersion: "0.4.0",
		Keep:         keep,
		Migrations:   migrations,
		Now:          func() time.Time { return machine.Now },
		Paths: migrate.Paths{
			Backups:  backupsPath,
			Install:  installPath,
			Ledger:   ledgerPath,
			Projects: projectsPath,
		},
		Sys: machine,
	})
}

func writing(id int, target migrate.Target, content string) migrate.Migration {
	return migrate.Migration{
		Apply: func(ctx *migrate.Context) error {
			return ctx.Write(target, []byte(content))
		},
		ID:      id,
		Slug:    "writes-" + string(target),
		Touches: []migrate.Target{target},
	}
}

func refusing(id int, target migrate.Target) migrate.Migration {
	return migrate.Migration{
		Apply:   func(_ *migrate.Context) error { return errRefused },
		ID:      id,
		Slug:    "refuses",
		Touches: []migrate.Target{target},
	}
}

var errRefused = &refusal{}

type refusal struct{}

func (r *refusal) Error() string { return "the shape is not the one expected" }

func configured(machine *modtest.FakeSys) {
	machine.Files[installPath] = []byte(`{"modules":["core.system"],"config":{}}` + "\n")
}

func ledgerOf(t *testing.T, machine *modtest.FakeSys) migrate.Ledger {
	t.Helper()

	raw, ok := machine.Files[ledgerPath]
	if !ok {
		t.Fatal("no ledger was written")
	}

	var ledger migrate.Ledger
	if err := json.Unmarshal(raw, &ledger); err != nil {
		t.Fatalf("ledger unreadable: %v", err)
	}

	return ledger
}

func TestAMachineNeverConfiguredIsBornAtTheCurrentRevision(t *testing.T) {
	machine := newSys()

	result, err := runner(machine, writing(1, migrate.TargetProjects, "touched\n")).Run()
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if result.State != contract.ConfigCurrent || result.Revision != 1 {
		t.Fatalf("result = %+v, want current at 1", result)
	}

	if len(result.Applied) != 0 {
		t.Fatalf("applied = %+v, want nothing run", result.Applied)
	}

	if _, written := machine.Files[projectsPath]; written {
		t.Fatal("a migration ran on a machine that has no configuration")
	}

	if ledger := ledgerOf(t, machine); ledger.Revision != 1 || len(ledger.Applied) != 0 {
		t.Fatalf("ledger = %+v, want revision 1 with no entry", ledger)
	}
}

func TestAConfiguredMachineRunsEveryMigrationInOrder(t *testing.T) {
	machine := newSys()
	configured(machine)

	result, err := runner(machine,
		writing(2, migrate.TargetProjects, "second\n"),
		writing(1, migrate.TargetProjects, "first\n"),
	).Run()
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if result.State != contract.ConfigCurrent || result.Revision != 2 {
		t.Fatalf("result = %+v, want current at 2", result)
	}

	if got := string(machine.Files[projectsPath]); got != "second\n" {
		t.Fatalf("projects = %q, want the second migration to have run last", got)
	}

	ledger := ledgerOf(t, machine)
	if len(ledger.Applied) != 2 || ledger.Applied[0].ID != 1 || ledger.Applied[1].ID != 2 {
		t.Fatalf("ledger = %+v, want 1 then 2", ledger.Applied)
	}

	if ledger.AgentVersion != "0.4.0" {
		t.Fatalf("agent version = %q, want the one that migrated", ledger.AgentVersion)
	}
}

func TestAMachineAlreadyThereDoesNothing(t *testing.T) {
	machine := newSys()
	configured(machine)
	machine.Files[ledgerPath] = []byte(`{"revision":1,"applied":[]}`)

	result, err := runner(machine, writing(1, migrate.TargetProjects, "first\n")).Run()
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if result.State != contract.ConfigCurrent || len(result.Applied) != 0 {
		t.Fatalf("result = %+v, want current with nothing run", result)
	}

	if _, written := machine.Files[projectsPath]; written {
		t.Fatal("a migration already applied ran again")
	}
}

func TestAMachineConfiguredByANewerAgentIsSaidToBeAhead(t *testing.T) {
	machine := newSys()
	configured(machine)
	machine.Files[ledgerPath] = []byte(`{"revision":7,"applied":[]}`)

	result, err := runner(machine, writing(1, migrate.TargetProjects, "first\n")).Run()
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if result.State != contract.ConfigAhead || result.Revision != 7 || result.Expected != 1 {
		t.Fatalf("result = %+v, want ahead at 7 of 1", result)
	}

	if _, written := machine.Files[projectsPath]; written {
		t.Fatal("an older agent touched a configuration it does not read")
	}
}

func TestARefusalPutsTheWholeBatchBack(t *testing.T) {
	machine := newSys()
	configured(machine)
	machine.Files[projectsPath] = []byte("as it was\n")

	result, err := runner(machine,
		writing(1, migrate.TargetProjects, "first\n"),
		refusing(2, migrate.TargetProjects),
	).Run()
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if result.State != contract.ConfigFailed || result.Revision != 0 {
		t.Fatalf("result = %+v, want failed at 0", result)
	}

	if result.Failure == nil || result.Failure.ID != 2 {
		t.Fatalf("failure = %+v, want migration 2", result.Failure)
	}

	if !result.Restored || result.Backup == "" {
		t.Fatalf("result = %+v, want the previous files put back and named", result)
	}

	if got := string(machine.Files[projectsPath]); got != "as it was\n" {
		t.Fatalf("projects = %q, want the file as it was", got)
	}

	if _, written := machine.Files[ledgerPath]; written {
		t.Fatal("the ledger kept a revision the files no longer hold")
	}

	if result.Pending[0] != 1 || result.Pending[1] != 2 {
		t.Fatalf("pending = %v, want both still owed", result.Pending)
	}
}

func TestARefusalRemovesAFileTheBatchHadCreated(t *testing.T) {
	machine := newSys()
	configured(machine)

	_, err := runner(machine,
		writing(1, migrate.TargetProjects, "created\n"),
		refusing(2, migrate.TargetProjects),
	).Run()
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if _, written := machine.Files[projectsPath]; written {
		t.Fatal("a file the batch created outlived the batch")
	}
}

func TestTheMachineKeepsOnlyTheLastBackups(t *testing.T) {
	machine := newSys()
	configured(machine)

	for revision := 1; revision <= 4; revision++ {
		machine.Now = machine.Now.Add(time.Hour)

		if _, err := keeping(machine, 2, upTo(revision)...).Run(); err != nil {
			t.Fatalf("Run: %v", err)
		}
	}

	kept := migrate.New(migrate.Options{
		Keep:  2,
		Paths: migrate.Paths{Backups: backupsPath, Install: installPath, Ledger: ledgerPath},
		Sys:   machine,
	}).Backups()

	if len(kept) != 2 {
		t.Fatalf("backups = %d, want the last two", len(kept))
	}

	if kept[0].From <= kept[1].From {
		t.Fatalf("backups = %+v, want the newest first", kept)
	}
}

func upTo(revision int) []migrate.Migration {
	var migrations []migrate.Migration
	for id := 1; id <= revision; id++ {
		migrations = append(migrations, writing(id, migrate.TargetProjects, "revision\n"))
	}

	return migrations
}

func TestRestorePutsTheFilesBackAndRewindsTheLedger(t *testing.T) {
	machine := newSys()
	configured(machine)
	machine.Files[projectsPath] = []byte("as it was\n")

	result, err := runner(machine, writing(1, migrate.TargetProjects, "migrated\n")).Run()
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	back, err := runner(machine, writing(1, migrate.TargetProjects, "migrated\n")).Restore(result.Backup)
	if err != nil {
		t.Fatalf("Restore: %v", err)
	}

	if got := string(machine.Files[projectsPath]); got != "as it was\n" {
		t.Fatalf("projects = %q, want the file as it was", got)
	}

	if back.Revision != 0 || back.State != contract.ConfigPending {
		t.Fatalf("result = %+v, want the ledger rewound to 0", back)
	}
}

func TestAnUnknownBackupIsRefusedByName(t *testing.T) {
	machine := newSys()

	if _, err := runner(machine).Restore("20260101T000000Z-r0"); err == nil {
		t.Fatal("restoring a backup nobody took was accepted")
	}
}

func TestAnUnreadableLedgerReplaysEverything(t *testing.T) {
	machine := newSys()
	configured(machine)
	machine.Files[ledgerPath] = []byte("{not json")

	result, err := runner(machine, writing(1, migrate.TargetProjects, "first\n")).Run()
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if result.State != contract.ConfigCurrent || len(result.Applied) != 1 {
		t.Fatalf("result = %+v, want the migration replayed", result)
	}
}

func TestStateReadsWithoutWriting(t *testing.T) {
	machine := newSys()
	configured(machine)

	state := runner(machine, writing(1, migrate.TargetProjects, "first\n")).State()

	if state.State != contract.ConfigPending || state.Expected != 1 {
		t.Fatalf("state = %+v, want pending under 1", state)
	}

	if _, written := machine.Files[ledgerPath]; written {
		t.Fatal("reading the state wrote the ledger")
	}
}

func TestAMigrationReadsAndWritesPlainJSON(t *testing.T) {
	machine := newSys()
	machine.Files[installPath] = []byte(`{"modules":["core.system"],"config":{"core.system":{"tz":"UTC"}},"unknown":42}`)

	renaming := migrate.Migration{
		Apply: func(ctx *migrate.Context) error {
			document, present, err := ctx.JSON(migrate.TargetInstall)
			if err != nil || !present {
				return err
			}

			config, _ := document["config"].(map[string]any)
			values, _ := config["core.system"].(map[string]any)
			values["timezone"] = values["tz"]
			delete(values, "tz")

			return ctx.SetJSON(migrate.TargetInstall, document)
		},
		ID:      1,
		Slug:    "rename-tz",
		Touches: []migrate.Target{migrate.TargetInstall},
	}

	if _, err := runner(machine, renaming).Run(); err != nil {
		t.Fatalf("Run: %v", err)
	}

	var document map[string]any
	if err := json.Unmarshal(machine.Files[installPath], &document); err != nil {
		t.Fatalf("install.json unreadable: %v", err)
	}

	values := document["config"].(map[string]any)["core.system"].(map[string]any)
	if values["timezone"] != "UTC" {
		t.Fatalf("values = %+v, want the renamed field", values)
	}

	// A field today's code does not name is a field the migration must not eat.
	if document["unknown"] == nil {
		t.Fatal("a field the agent no longer names was dropped on the way through")
	}
}

func TestTheProcessThatSawARefusalKeepsSayingSo(t *testing.T) {
	machine := newSys()
	configured(machine)

	running := runner(machine, refusing(1, migrate.TargetProjects))

	if _, err := running.Run(); err != nil {
		t.Fatalf("Run: %v", err)
	}

	if state := running.State(); state.State != contract.ConfigFailed {
		t.Fatalf("state = %+v, want failed rather than merely behind", state)
	}

	// Another process reads the ledger and nothing else: it has not tried yet,
	// so all it can say is that the machine is behind.
	if state := runner(machine, refusing(1, migrate.TargetProjects)).State(); state.State != contract.ConfigPending {
		t.Fatalf("state = %+v, want pending for a process that has not tried", state)
	}
}

const legacyRegistry = `# Projects added from Pupitre or by an agent.
# This file survives deployments: the repository never touches it.

eight|eight|-|bun|127.0.0.1|3000|eight|bun run dev
nine|apps/nine|https://github.com/me/nine|pnpm|127.0.0.1|https:3001|-|pnpm dev|pnpm install --frozen-lockfile
ten|ten|-|bun|127.0.0.1|3002|api.ten|bun run dev|-|release/2.0
my.site|my.site|-|bun|127.0.0.1|3003|my-site|bun run dev
`

type migratedProject struct {
	Name    string `json:"name"`
	Dir     string `json:"dir"`
	Repo    string `json:"repo"`
	PkgMgr  string `json:"pkgmgr"`
	Host    string `json:"host"`
	Port    int    `json:"port"`
	Cmd     string `json:"cmd"`
	Install string `json:"install"`
	Branch  string `json:"branch"`
	Routes  []struct {
		Label    string `json:"label"`
		Port     int    `json:"port"`
		Hostname string `json:"hostname"`
	} `json:"routes"`
}

func migratedProjects(t *testing.T, machine *modtest.FakeSys) []migratedProject {
	t.Helper()

	raw, ok := machine.Files[projectsPath]
	if !ok {
		t.Fatal("no JSON registry was written")
	}

	var document struct {
		Projects []migratedProject `json:"projects"`
	}
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatalf("registry unreadable: %v", err)
	}

	return document.Projects
}

func TestMigrationOneCarriesTheRowsOfEightNineAndTenColumnsToJSON(t *testing.T) {
	machine := newSys()
	configured(machine)
	machine.Files[legacyPath] = []byte(legacyRegistry)
	machine.Files[envPath] = []byte("PUPITRE_DOMAIN=flymate.dev\n")

	result, err := runner(machine, migrate.All()...).Run()
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if result.State != contract.ConfigCurrent || result.Revision != 1 || len(result.Applied) != 1 {
		t.Fatalf("result = %+v, want current at 1 after one run", result)
	}

	projects := migratedProjects(t, machine)
	if len(projects) != 4 {
		t.Fatalf("got %d projects, want the four rows: %+v", len(projects), projects)
	}

	eight := projects[0]
	if eight.Name != "eight" || eight.Port != 3000 || eight.Repo != "" || eight.Install != "" || eight.Branch != "" {
		t.Fatalf("unexpected eight-column row: %+v", eight)
	}
	if len(eight.Routes) != 1 || eight.Routes[0].Label != "eight" || eight.Routes[0].Port != 3000 || eight.Routes[0].Hostname != "eight.flymate.dev" {
		t.Fatalf("the subdomain must become the hostname of one route: %+v", eight.Routes)
	}

	nine := projects[1]
	if nine.Port != 3001 || nine.Repo != "https://github.com/me/nine" || nine.Install != "pnpm install --frozen-lockfile" || len(nine.Routes) != 0 {
		t.Fatalf("unexpected nine-column row: %+v", nine)
	}

	ten := projects[2]
	if ten.Branch != "release/2.0" || ten.Install != "" || len(ten.Routes) != 1 || ten.Routes[0].Hostname != "api.ten.flymate.dev" {
		t.Fatalf("unexpected ten-column row: %+v", ten)
	}

	dotted := projects[3]
	if len(dotted.Routes) != 1 || dotted.Routes[0].Label != "my-site" {
		t.Fatalf("a name a DNS label cannot carry is folded into the route's label: %+v", dotted.Routes)
	}

	if _, kept := machine.Files[legacyPath]; kept {
		t.Fatal("the old file must be gone once its rows are carried over")
	}

	backup := backupsPath + "/" + result.Backup
	if _, saved := machine.Files[backup+"/projects.local.conf"]; !saved {
		t.Fatalf("the old file must be kept in the backup: %v", keys(machine))
	}

	before := string(machine.Files[projectsPath])
	again, err := runner(machine, migrate.All()...).Run()
	if err != nil {
		t.Fatalf("second Run: %v", err)
	}
	if len(again.Applied) != 0 || string(machine.Files[projectsPath]) != before {
		t.Fatal("a second pass must change nothing")
	}
}

func TestMigrationOneKeepsARouteWithoutAHostnameWhenTheMachineHasNoDomain(t *testing.T) {
	machine := newSys()
	configured(machine)
	machine.Files[legacyPath] = []byte("web|web|-|bun|127.0.0.1|3000|shop|bun run dev\n")

	var journal []string
	runner := migrate.New(migrate.Options{
		AgentVersion: "0.4.0",
		Logf:         func(format string, args ...any) { journal = append(journal, fmt.Sprintf(format, args...)) },
		Migrations:   migrate.All(),
		Now:          func() time.Time { return machine.Now },
		Paths:        migrate.Paths{Backups: backupsPath, Install: installPath, Ledger: ledgerPath, Projects: projectsPath},
		Sys:          machine,
	})

	if _, err := runner.Run(); err != nil {
		t.Fatalf("Run: %v", err)
	}

	projects := migratedProjects(t, machine)
	if len(projects) != 1 || len(projects[0].Routes) != 1 || projects[0].Routes[0].Hostname != "" || projects[0].Routes[0].Port != 3000 {
		t.Fatalf("the route must keep its port and carry no hostname: %+v", projects)
	}

	if !strings.Contains(strings.Join(journal, "\n"), `"shop"`) {
		t.Fatalf("the journal must keep the subdomain that could not be resolved: %v", journal)
	}
}

func TestMigrationOneLeavesAMachineWithoutTheOldFileAlone(t *testing.T) {
	machine := newSys()
	configured(machine)

	if _, err := runner(machine, migrate.All()...).Run(); err != nil {
		t.Fatalf("Run: %v", err)
	}

	if _, written := machine.Files[projectsPath]; written {
		t.Fatal("a machine that never held the old registry gets no JSON one from a migration")
	}
}

func TestMigrationOneKeepsWhatAnInterruptedRunAlreadyWrote(t *testing.T) {
	machine := newSys()
	configured(machine)
	machine.Files[projectsPath] = []byte(`{"projects":[{"name":"web","dir":"web","pkgmgr":"bun","host":"127.0.0.1","port":3000,"routes":[{"label":"web","port":3000,"hostname":"kept.flymate.dev"}],"cmd":"bun run dev"}]}` + "\n")
	machine.Files[legacyPath] = []byte("web|web|-|bun|127.0.0.1|3000|web|bun run dev\napi|api|-|bun|127.0.0.1|3001|-|bun run api\n")
	machine.Files[envPath] = []byte("PUPITRE_DOMAIN=flymate.dev\n")

	if _, err := runner(machine, migrate.All()...).Run(); err != nil {
		t.Fatalf("Run: %v", err)
	}

	projects := migratedProjects(t, machine)
	if len(projects) != 2 || projects[0].Routes[0].Hostname != "kept.flymate.dev" || projects[1].Name != "api" {
		t.Fatalf("the JSON rows win and the old file only fills what they lack: %+v", projects)
	}
}

func keys(machine *modtest.FakeSys) []string {
	var names []string
	for name := range machine.Files {
		names = append(names, name)
	}

	return names
}
