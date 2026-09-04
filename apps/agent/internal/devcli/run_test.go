package devcli_test

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/db"
	"pupitre.studio/agent/internal/modules/db/postgres"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/state"
)

const conf = `web|web|https://github.com/me/web|bun|127.0.0.1|3000|web|bun run dev --port 3000
`

type run struct {
	code   int
	stdout string
	stderr string
}

func fixture(t *testing.T) (*modtest.FakeSys, func(...string) run) {
	t.Helper()

	fake := modtest.NewFakeSys()
	fake.Files[registry.DefaultConf] = []byte(conf)
	fake.Dirs["/home/dev/projects/web"] = true
	fake.Packages["postgresql-17"] = "17.2-1.pgdg24.04+1"

	catalog := modules.NewRegistry()
	catalog.Register(postgres.Module{})

	dir := t.TempDir()
	engine := &modules.Engine{
		Registry:     catalog,
		Sys:          fake,
		Now:          modtest.NewClock(time.Millisecond).Now,
		Entitlement:  func() contract.Entitlement { return contract.EntitlementDev },
		AgentVersion: "0.0.0-test",
		ReportPath:   filepath.Join(dir, "report.json"),
		LogPath:      filepath.Join(dir, "pupitre.log"),
		InstallPath:  filepath.Join(dir, "install.json"),
	}

	server := protocol.NewServer(protocol.Options{AgentVersion: "0.0.0-test", Entitlement: contract.EntitlementDev})
	db.RegisterCommands(server, engine)
	state.RegisterCommands(server, state.FromEngine(engine, state.Options{
		Follow: state.FollowOptions{Interval: time.Millisecond, Limit: -1, Sleep: func(time.Duration) {}},
		Sleep:  func(time.Duration) {},
	}))

	return fake, func(args ...string) run {
		var stdout, stderr bytes.Buffer
		code := devcli.Run(devcli.Options{Server: server}, args, &stdout, &stderr)

		return run{code: code, stdout: stdout.String(), stderr: stderr.String()}
	}
}

func TestDevCoversTheDrivingVerbs(t *testing.T) {
	fake, dev := fixture(t)
	fake.Serves("web", 3000)
	fake.Answer("rev-parse --show-toplevel", "/home/dev/projects/web")
	fake.Answer("rev-parse --abbrev-ref", "feat/planning")
	fake.Answer("for-each-ref", "main\nfeat/planning")

	cases := []struct {
		args []string
		want string
	}{
		{[]string{"up", "web"}, "web"},
		{[]string{"status"}, "web"},
		{[]string{"logs", "web", "-n", "5"}, ""},
		{[]string{"branch"}, "web"},
		{[]string{"branch", "web"}, "feat/planning"},
		{[]string{"attach", "web"}, "tmux attach-session -t pupitre:web"},
		{[]string{"db", "url"}, "postgresql://dev@127.0.0.1:5432/postgres"},
		{[]string{"db", "url", "postgres"}, "postgresql://dev@127.0.0.1:5432/postgres"},
		{[]string{"restart", "web"}, "web"},
		{[]string{"down", "web"}, "web"},
	}

	for _, want := range cases {
		got := dev(want.args...)
		if got.code != 0 {
			t.Fatalf("dev %s exited %d\n%s", strings.Join(want.args, " "), got.code, got.stderr)
		}

		if !strings.Contains(got.stdout, want.want) {
			t.Errorf("dev %s printed %q, want %q inside", strings.Join(want.args, " "), got.stdout, want.want)
		}
	}
}

func TestDevSyncAndDoctorReportWhatHappened(t *testing.T) {
	fake, dev := fixture(t)
	fake.Answer("rev-parse --show-toplevel", "/home/dev/projects/web")
	fake.Answer("rev-parse --abbrev-ref", "main")
	fake.Answer("pull --ff-only", "Updating 1a2b3c4..5d6e7f8")

	synced := dev("sync", "web")
	if synced.code != 0 || !strings.Contains(synced.stdout, "web ·") {
		t.Fatalf("code = %d, stdout = %q, stderr = %q", synced.code, synced.stdout, synced.stderr)
	}

	// A machine where nothing is installed has points to fix, and doctor says so with a non-zero exit.
	checked := dev("doctor")
	if checked.code != 1 || !strings.Contains(checked.stdout, "KO") {
		t.Fatalf("code = %d, stdout = %q", checked.code, checked.stdout)
	}
}

func TestDevAnswersInJSONOnDemand(t *testing.T) {
	_, dev := fixture(t)

	got := dev("status", "--json")
	if got.code != 0 {
		t.Fatalf("code = %d, stderr = %q", got.code, got.stderr)
	}

	var value any
	if err := json.Unmarshal([]byte(got.stdout), &value); err != nil {
		t.Fatalf("--json must print the protocol answer: %v\n%s", err, got.stdout)
	}

	if err := contract.Validate("StatusResult", decoded(t, got.stdout)); err != nil {
		t.Fatalf("--json violates StatusResult: %v", err)
	}
}

func TestDevRefusesWhatItCannotDo(t *testing.T) {
	_, dev := fixture(t)

	for _, args := range [][]string{{}, {"fly"}, {"up"}, {"up", "--bogus"}, {"db", "explode"}} {
		got := dev(args...)
		if got.code != 2 || !strings.Contains(got.stderr, "usage") {
			t.Errorf("dev %s exited %d, stderr = %q", strings.Join(args, " "), got.code, got.stderr)
		}
	}

	unknown := dev("up", "absent")
	if unknown.code != 1 || !strings.Contains(unknown.stderr, "project_not_found") {
		t.Fatalf("code = %d, stderr = %q", unknown.code, unknown.stderr)
	}

	if !strings.Contains(unknown.stderr, "project.list") {
		t.Errorf("a refusal must carry its fix: %q", unknown.stderr)
	}
}

func TestDevRefusesEverythingInRestrictedMode(t *testing.T) {
	server := protocol.NewServer(protocol.Options{AgentVersion: "0.0.0-test", Entitlement: contract.EntitlementRestricted})
	state.RegisterCommands(server, state.New(state.Options{Sys: modtest.NewFakeSys()}))

	var stdout, stderr bytes.Buffer
	code := devcli.Run(devcli.Options{Server: server}, []string{"up", "web"}, &stdout, &stderr)

	if code != 1 || !strings.Contains(stderr.String(), "entitlement_required") {
		t.Fatalf("code = %d, stderr = %q", code, stderr.String())
	}
}

func decoded(t *testing.T, text string) any {
	t.Helper()

	value, err := contract.Decode([]byte(text))
	if err != nil {
		t.Fatal(err)
	}

	return value
}

func TestDevDbNamesTheDumpsItImported(t *testing.T) {
	fake, dev := fixture(t)
	fake.Dirs["/home/dev/dumps"] = true
	fake.Files["/home/dev/dumps/shop.sql"] = []byte("CREATE TABLE shop (id int);\n")

	got := dev("db", "import")
	if got.code != 0 {
		t.Fatalf("code = %d, stderr = %q", got.code, got.stderr)
	}

	if !strings.Contains(got.stdout, "shop") {
		t.Fatalf("db import must name what it loaded: %q", got.stdout)
	}
}
