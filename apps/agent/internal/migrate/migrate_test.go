package migrate_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"strings"
	"syscall"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/migrate"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
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

func TestAPanicInAMigrationIsARefusalThatPutsTheBatchBack(t *testing.T) {
	machine := newSys()
	configured(machine)
	machine.Files[projectsPath] = []byte("as it was\n")

	panicking := migrate.Migration{
		ID:      2,
		Slug:    "panics",
		Touches: []migrate.Target{migrate.TargetProjects},
		Apply: func(*migrate.Context) error {
			var rows []string

			return errors.New(rows[3])
		},
	}

	result, err := runner(machine, writing(1, migrate.TargetProjects, "first\n"), panicking).Run()
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if result.State != contract.ConfigFailed || result.Failure == nil || result.Failure.ID != 2 || !strings.Contains(result.Failure.Message, "index out of range") {
		t.Fatalf("result = %+v, want the panic as the failure of migration 2", result)
	}

	if !result.Restored || string(machine.Files[projectsPath]) != "as it was\n" {
		t.Fatalf("the batch must go back: restored = %v, projects = %q", result.Restored, machine.Files[projectsPath])
	}

	if _, written := machine.Files[ledgerPath]; written {
		t.Fatal("the ledger kept a revision the files no longer hold")
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

func TestAnUnreadableLedgerIsRefusedAndNothingReplayed(t *testing.T) {
	machine := newSys()
	configured(machine)
	machine.Files[ledgerPath] = []byte("{not json")

	migrator := runner(machine, writing(1, migrate.TargetProjects, "first\n"))

	_, err := migrator.Run()

	var refusal *protocol.Error
	if !errors.As(err, &refusal) || refusal.Code != contract.ErrorMigrationRequired || !strings.Contains(refusal.Fix, ledgerPath) {
		t.Fatalf("got %v, want a refusal that says how to put the ledger back", err)
	}

	if _, written := machine.Files[projectsPath]; written || string(machine.Files[ledgerPath]) != "{not json" {
		t.Fatal("a ledger that does not read replays nothing and is left as it is")
	}

	if state := migrator.State(); state.State != contract.ConfigFailed {
		t.Fatalf("state = %+v, want failed: every command that reads the configuration waits", state)
	}
}

func TestAMissingLedgerStillReplaysEverything(t *testing.T) {
	machine := newSys()
	configured(machine)

	result, err := runner(machine, writing(1, migrate.TargetProjects, "first\n")).Run()
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if result.State != contract.ConfigCurrent || len(result.Applied) != 1 {
		t.Fatalf("result = %+v, want the migration replayed", result)
	}
}

type unreadable struct {
	*modtest.FakeSys
	path string
}

func (u unreadable) ReadFile(path string) ([]byte, error) {
	if path == u.path {
		return nil, &fs.PathError{Op: "open", Path: path, Err: syscall.EIO}
	}

	return u.FakeSys.ReadFile(path)
}

func TestAFileThatFailsToReadIsNeverBackedUpAsAbsent(t *testing.T) {
	machine := newSys()
	configured(machine)
	machine.Files[projectsPath] = []byte("held\n")

	migrator := migrate.New(migrate.Options{
		Migrations: []migrate.Migration{writing(1, migrate.TargetProjects, "first\n")},
		Now:        func() time.Time { return machine.Now },
		Paths:      migrate.Paths{Backups: backupsPath, Install: installPath, Ledger: ledgerPath, Projects: projectsPath},
		Sys:        unreadable{FakeSys: machine, path: projectsPath},
	})

	if _, err := migrator.Run(); err == nil {
		t.Fatal("a batch whose backup could not read a file must not run")
	}

	if string(machine.Files[projectsPath]) != "held\n" {
		t.Fatal("the file is left as it is: a restore of that backup would have removed it")
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

type migratedRoute struct {
	Label    string `json:"label"`
	Port     int    `json:"port"`
	Hostname string `json:"hostname"`
}

type migratedProcess struct {
	ID      string          `json:"id"`
	Dir     string          `json:"dir"`
	PkgMgr  string          `json:"pkgmgr"`
	Host    string          `json:"host"`
	Port    int             `json:"port"`
	Cmd     string          `json:"cmd"`
	Install string          `json:"install"`
	Routes  []migratedRoute `json:"routes"`
}

type migratedProject struct {
	Name      string            `json:"name"`
	Dir       string            `json:"dir"`
	Repo      string            `json:"repo"`
	Branch    string            `json:"branch"`
	Boot      *bool             `json:"boot"`
	Runtimes  map[string]string `json:"runtimes"`
	Processes []migratedProcess `json:"processes"`
}

func (p migratedProject) only(t *testing.T) migratedProcess {
	t.Helper()

	if len(p.Processes) != 1 {
		t.Fatalf("%s: got %d processes, want one: %+v", p.Name, len(p.Processes), p.Processes)
	}

	return p.Processes[0]
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
	machine.Files[envPath] = []byte("PUPITRE_DOMAIN=flyleaf.dev\n")

	result, err := runner(machine, migrate.All()...).Run()
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if result.State != contract.ConfigCurrent || result.Revision != 6 || len(result.Applied) != 6 {
		t.Fatalf("result = %+v, want current at 6 after one run", result)
	}

	projects := migratedProjects(t, machine)
	if len(projects) != 4 {
		t.Fatalf("got %d projects, want the four rows: %+v", len(projects), projects)
	}

	eight := projects[0]
	if eight.Name != "eight" || eight.Dir != "eight" || eight.Repo != "" || eight.Branch != "" {
		t.Fatalf("unexpected eight-column row: %+v", eight)
	}

	if process := eight.only(t); process.ID != "eight" || process.Dir != "." || process.Port != 3000 || process.Install != "" {
		t.Fatalf("a row becomes one process at the root of its project: %+v", process)
	}

	if routes := eight.only(t).Routes; len(routes) != 1 || routes[0].Label != "eight" || routes[0].Port != 3000 || routes[0].Hostname != "eight.flyleaf.dev" {
		t.Fatalf("the subdomain must become the hostname of one route: %+v", routes)
	}

	nine := projects[1]
	if nine.Name != "nine" || nine.Dir != "apps" || nine.Repo != "https://github.com/me/nine" {
		t.Fatalf("the first segment of the folder is the repository: %+v", nine)
	}

	if process := nine.only(t); process.Dir != "nine" || process.Port != 3001 || process.Install != "pnpm install --frozen-lockfile" || len(process.Routes) != 0 {
		t.Fatalf("unexpected nine-column row: %+v", process)
	}

	ten := projects[2]
	if ten.Branch != "release/2.0" || ten.only(t).Install != "" || len(ten.only(t).Routes) != 1 || ten.only(t).Routes[0].Hostname != "api.ten.flyleaf.dev" {
		t.Fatalf("unexpected ten-column row: %+v", ten)
	}

	dotted := projects[3]
	if routes := dotted.only(t).Routes; len(routes) != 1 || routes[0].Label != "my-site" || dotted.only(t).ID != "my-site" {
		t.Fatalf("a name a DNS label cannot carry is folded into the route's label and the process id: %+v", dotted)
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
	if len(projects) != 1 || len(projects[0].only(t).Routes) != 1 || projects[0].only(t).Routes[0].Hostname != "" || projects[0].only(t).Routes[0].Port != 3000 {
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
	machine.Files[projectsPath] = []byte(`{"projects":[{"name":"web","dir":"web","pkgmgr":"bun","host":"127.0.0.1","port":3000,"routes":[{"label":"web","port":3000,"hostname":"kept.flyleaf.dev"}],"cmd":"bun run dev"}]}` + "\n")
	machine.Files[legacyPath] = []byte("web|web|-|bun|127.0.0.1|3000|web|bun run dev\napi|api|-|bun|127.0.0.1|3001|-|bun run api\n")
	machine.Files[envPath] = []byte("PUPITRE_DOMAIN=flyleaf.dev\n")

	if _, err := runner(machine, migrate.All()...).Run(); err != nil {
		t.Fatalf("Run: %v", err)
	}

	projects := migratedProjects(t, machine)
	if len(projects) != 2 || projects[0].only(t).Routes[0].Hostname != "kept.flyleaf.dev" || projects[1].Name != "api" {
		t.Fatalf("the JSON rows win and the old file only fills what they lack: %+v", projects)
	}
}

func TestMigrationTwoGathersTheRowsOfOneRepositoryIntoOneProject(t *testing.T) {
	machine := newSys()
	configured(machine)
	machine.Files[ledgerPath] = []byte(`{"revision":1,"applied":[]}`)
	machine.Files[projectsPath] = []byte(`{"projects":[` +
		`{"name":"api","dir":"api-server/server","repo":"https://github.com/me/api-server","pkgmgr":"gradle","host":"127.0.0.1","port":8080,"routes":[{"label":"api","port":8080,"hostname":"api.flyleaf.dev"}],"cmd":"SERVER_PORT=8080 ./gradlew bootRun"},` +
		`{"name":"web","dir":"web","pkgmgr":"bun","host":"127.0.0.1","port":3000,"routes":[],"cmd":"bun run dev"},` +
		`{"name":"api-web","dir":"api-server/client","pkgmgr":"pnpm","host":"127.0.0.1","port":5180,"routes":[{"label":"api-web","port":5180,"hostname":"api-web.flyleaf.dev"}],"cmd":"pnpm run dev --port 5180","install":"pnpm install --frozen-lockfile","branch":"release/2.0"}` +
		`]}` + "\n")
	machine.Files[envPath] = []byte("PUPITRE_DOMAIN=flyleaf.dev\nPUPITRE_DEBUG_PORTS=\"api:5005 web:5006 ghost:5007\"\n")

	result, err := runner(machine, migrate.All()...).Run()
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if result.Revision != 6 || len(result.Applied) != 5 || result.Applied[0].ID != 2 || result.Applied[3].ID != 5 {
		t.Fatalf("result = %+v, want the second to sixth migrations on a machine already at one", result)
	}

	projects := migratedProjects(t, machine)
	if len(projects) != 2 || projects[0].Name != "api-server" || projects[1].Name != "web" {
		t.Fatalf("got %+v, want api-server then web", projects)
	}

	server := projects[0]
	if server.Dir != "api-server" || server.Repo != "https://github.com/me/api-server" || server.Branch != "release/2.0" || len(server.Processes) != 2 {
		t.Fatalf("unexpected project: %+v", server)
	}

	if api := server.Processes[0]; api.ID != "api" || api.Dir != "server" || api.Port != 8080 || api.Routes[0].Hostname != "api.flyleaf.dev" {
		t.Fatalf("unexpected process: %+v", api)
	}

	if client := server.Processes[1]; client.ID != "api-web" || client.Dir != "client" || client.Install != "pnpm install --frozen-lockfile" {
		t.Fatalf("unexpected process: %+v", client)
	}

	if web := projects[1].only(t); web.Dir != "." || web.ID != "web" {
		t.Fatalf("a row alone keeps its name and runs from its root: %+v", web)
	}

	env := string(machine.Files[envPath])
	if !strings.Contains(env, `PUPITRE_DEBUG_PORTS="api-server/api:5005 web/web:5006 ghost:5007"`) || !strings.Contains(env, "PUPITRE_DOMAIN=flyleaf.dev") {
		t.Fatalf("the debug ports must name the windows, and the rest of the file stay:\n%s", env)
	}

	before := string(machine.Files[projectsPath])

	again, err := runner(machine, migrate.All()...).Run()
	if err != nil || len(again.Applied) != 0 || string(machine.Files[projectsPath]) != before {
		t.Fatalf("a second pass must change nothing: %+v, %v", again, err)
	}
}

func keys(machine *modtest.FakeSys) []string {
	var names []string

	for name := range machine.Files {
		names = append(names, name)
	}

	return names
}

func TestMigrationThreeWritesTheBootColumnOnEveryRow(t *testing.T) {
	machine := newSys()
	configured(machine)
	machine.Files[ledgerPath] = []byte(`{"revision":2,"applied":[]}`)
	machine.Files[projectsPath] = []byte(`{"projects":[` +
		`{"name":"web","dir":"web","processes":[{"id":"web","dir":".","pkgmgr":"bun","host":"127.0.0.1","port":3000,"routes":[],"cmd":"bun run dev"}]},` +
		`{"name":"api","dir":"api","boot":true,"processes":[{"id":"api","dir":".","pkgmgr":"bun","host":"127.0.0.1","port":3001,"routes":[],"cmd":"bun run dev"}]}` +
		`]}` + "\n")

	result, err := runner(machine, migrate.All()...).Run()
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if result.Revision != 6 || len(result.Applied) != 4 || result.Applied[0].ID != 3 {
		t.Fatalf("result = %+v, want the third migration first on a machine already at two", result)
	}

	projects := migratedProjects(t, machine)
	if len(projects) != 2 || projects[0].Boot == nil || *projects[0].Boot || projects[1].Boot == nil || !*projects[1].Boot {
		t.Fatalf("every row must carry boot, false unless it already said true: %+v", projects)
	}

	before := string(machine.Files[projectsPath])

	if again, err := runner(machine, migrate.All()...).Run(); err != nil || len(again.Applied) != 0 || string(machine.Files[projectsPath]) != before {
		t.Fatal("a second pass must change nothing")
	}
}

func TestMigrationThreeLeavesAMachineWithoutARegistryAlone(t *testing.T) {
	machine := newSys()
	configured(machine)
	machine.Files[ledgerPath] = []byte(`{"revision":2,"applied":[]}`)

	if _, err := runner(machine, migrate.All()...).Run(); err != nil {
		t.Fatalf("Run: %v", err)
	}

	if _, written := machine.Files[projectsPath]; written {
		t.Fatal("no registry, nothing to carry")
	}
}

func TestMigrationFourTurnsEachRuntimeVersionIntoAListOfOne(t *testing.T) {
	machine := newSys()
	machine.Files[ledgerPath] = []byte(`{"revision":3,"applied":[]}`)
	machine.Files[installPath] = []byte(`{"modules":["core.system","runtime.node","runtime.java","runtime.python","runtime.go","db.postgres"],"config":{` +
		`"runtime.node":{"node_version":"22","bun":true},` +
		`"runtime.java":{"java_version":"17"},` +
		`"runtime.python":{"python_versions":["3.12"],"python_version":"3.11"},` +
		`"runtime.go":{"gopath":"/srv/go"},` +
		`"db.postgres":{"version":"17","port":5432}` +
		`}}` + "\n")

	result, err := runner(machine, migrate.All()...).Run()
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if result.Revision != 6 || len(result.Applied) != 3 || result.Applied[0].ID != 4 {
		t.Fatalf("result = %+v, want the fourth to sixth migrations on a machine already at three", result)
	}

	var document struct {
		Config map[string]map[string]any `json:"config"`
	}

	if err := json.Unmarshal(machine.Files[installPath], &document); err != nil {
		t.Fatal(err)
	}

	for module, want := range map[string]string{
		"runtime.node":   `{"bun":true,"node_versions":["22"]}`,
		"runtime.java":   `{"java_versions":["17"]}`,
		"runtime.python": `{"python_versions":["3.12"]}`,
		"runtime.go":     `{"gopath":"/srv/go"}`,
		"db.postgres":    `{"port":5432,"version":"17"}`,
	} {
		got, _ := json.Marshal(document.Config[module])
		if string(got) != want {
			t.Errorf("%s = %s, want %s", module, got, want)
		}
	}

	before := string(machine.Files[installPath])

	if again, err := runner(machine, migrate.All()...).Run(); err != nil || len(again.Applied) != 0 || string(machine.Files[installPath]) != before {
		t.Fatal("a second pass must change nothing")
	}
}

func TestMigrationFiveWritesTheRuntimesColumnOnEveryRow(t *testing.T) {
	machine := newSys()
	configured(machine)
	machine.Files[ledgerPath] = []byte(`{"revision":4,"applied":[]}`)
	machine.Files[projectsPath] = []byte(`{"projects":[` +
		`{"name":"web","dir":"web","boot":false,"processes":[{"id":"web","dir":".","pkgmgr":"bun","host":"127.0.0.1","port":3000,"routes":[],"cmd":"bun run dev"}]},` +
		`{"name":"api","dir":"api","boot":true,"runtimes":{"java":"17"},"processes":[{"id":"api","dir":".","pkgmgr":"gradle","host":"127.0.0.1","port":8080,"routes":[],"cmd":"./gradlew bootRun"}]}` +
		`]}` + "\n")

	result, err := runner(machine, migrate.All()...).Run()
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if result.Revision != 6 || len(result.Applied) != 2 || result.Applied[0].ID != 5 {
		t.Fatalf("result = %+v, want the fifth and sixth migrations on a machine already at four", result)
	}

	projects := migratedProjects(t, machine)
	if len(projects) != 2 || projects[0].Runtimes == nil || len(projects[0].Runtimes) != 0 || projects[1].Runtimes["java"] != "17" {
		t.Fatalf("every row must carry runtimes, empty unless it already named some: %+v", projects)
	}

	before := string(machine.Files[projectsPath])

	if again, err := runner(machine, migrate.All()...).Run(); err != nil || len(again.Applied) != 0 || string(machine.Files[projectsPath]) != before {
		t.Fatal("a second pass must change nothing")
	}
}
