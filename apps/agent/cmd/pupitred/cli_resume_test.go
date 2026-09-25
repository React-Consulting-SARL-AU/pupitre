package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys/lock"
)

func aheadOfThisBinary(t *testing.T, dir string) {
	t.Helper()

	t.Setenv("PUPITRE_LEDGER_PATH", filepath.Join(dir, "migrations.json"))
	t.Setenv("PUPITRE_BACKUPS_PATH", filepath.Join(dir, "backups"))
}

func TestResumeLeavesTheRecordAloneWhenTheConfigurationIsNotCurrent(t *testing.T) {
	fake, dir := setupCLI(t)
	aheadOfThisBinary(t, dir)
	fake.Files["/etc/pupitre/install.json"] = []byte(`{"modules":[]}`)
	fake.Files[filepath.Join(dir, "migrations.json")] = []byte(`{"revision": 99, "applied": []}`)
	fake.Files[registry.DefaultConf] = []byte("web|web|-|bun|127.0.0.1|3000|web|bun run dev --port 3000\n")
	fake.Files[registry.DefaultRunning] = []byte("{\n  \"windows\": [\n    \"web/web\"\n  ]\n}\n")
	fake.Dirs["/home/dev/projects/web"] = true

	code, stdout, _ := runCLI(t, "resume")
	if code != 0 || stdout != "" {
		t.Fatalf("code = %d, stdout = %q", code, stdout)
	}

	if string(fake.Files[registry.DefaultRunning]) != "{\n  \"windows\": [\n    \"web/web\"\n  ]\n}\n" {
		t.Fatalf("the record was rewritten:\n%s", fake.Files[registry.DefaultRunning])
	}

	if _, open := fake.Windows["web/web"]; open {
		t.Fatal("nothing must start on a configuration this binary does not read")
	}
}

func TestResumeBringsTheRecordedWindowsBack(t *testing.T) {
	fake, _ := setupCLI(t)
	fake.Files[registry.DefaultConf] = []byte("web|web|-|bun|127.0.0.1|3000|web|bun run dev --port 3000\n")
	fake.Files[registry.DefaultRunning] = []byte(`{"windows": ["web/web"]}`)
	fake.Dirs["/home/dev/projects/web"] = true

	code, stdout, _ := runCLI(t, "resume")
	if code != 0 || strings.TrimSpace(stdout) != "web/web" {
		t.Fatalf("code = %d, stdout = %q", code, stdout)
	}
}

func TestInstallRefusesWhenTheConfigurationIsNotCurrent(t *testing.T) {
	fake, dir := setupCLI(t)
	aheadOfThisBinary(t, dir)
	fake.Files["/etc/pupitre/install.json"] = []byte(`{"modules":["tool.demo"],"config":{}}`)
	fake.Files[filepath.Join(dir, "migrations.json")] = []byte(`{"revision": 99, "applied": []}`)

	code, _, stderr := runCLI(t, "install", "--only=tool.demo")
	if code != 1 || !strings.Contains(stderr, "migration_required") {
		t.Fatalf("code = %d, stderr = %s", code, stderr)
	}

	if strings.Contains(strings.Join(fake.Mutations, "\n"), "tool.demo") {
		t.Fatalf("nothing must be installed: %v", fake.Mutations)
	}
}

func TestInstallMigratesBeforeReadingTheConfiguration(t *testing.T) {
	fake, dir := setupCLI(t)
	aheadOfThisBinary(t, dir)
	fake.Files["/etc/pupitre/install.json"] = []byte(`{"modules":["db.broken"],"config":{}}`)

	code, _, stderr := runCLI(t, "install", "--only=db.broken")
	if code != 1 || !strings.Contains(stderr, "install-package") {
		t.Fatalf("the install must have run: code = %d, stderr = %s", code, stderr)
	}

	if _, written := fake.Files[filepath.Join(dir, "migrations.json")]; !written {
		t.Fatalf("the ledger must have been brought to the revision this binary reads: %v", fake.Mutations)
	}
}

func TestReportSaysARunNobodyFinishedWasInterrupted(t *testing.T) {
	_, dir := setupCLI(t)
	running := `{"started_at":"2026-09-04T12:00:00Z","finished_at":"","agent_version":"dev","modules":[{"id":"db.postgres","status":"ok","steps":[{"step":"apt","status":"ok","ms":3},{"step":"cluster","status":"start","ms":0,"replay":"pupitred install --only=db.postgres"}]}],"failed":[],"warned":[],"report_path":"` + filepath.Join(dir, "report.json") + `"}`

	if err := os.WriteFile(filepath.Join(dir, "report.json"), []byte(running), 0o600); err != nil {
		t.Fatal(err)
	}

	release, held, err := lock.Acquire(filepath.Join(dir, "install.lock"))
	if err != nil || !held {
		t.Fatalf("Acquire: %v, %v", held, err)
	}

	code, stdout, stderr := runCLI(t, "report")
	if code != 0 || !strings.Contains(stdout, `"finished_at": ""`) || !strings.Contains(stdout, `"status": "start"`) {
		t.Fatalf("while the lock is held the run is under way: code = %d, stdout = %s, stderr = %s", code, stdout, stderr)
	}

	release()

	code, stdout, stderr = runCLI(t, "report")
	if code != 0 || strings.Contains(stdout, `"finished_at": ""`) || !strings.Contains(stdout, `"status": "fail"`) || !strings.Contains(stdout, `"db.postgres"`) {
		t.Fatalf("once the lock is free the run is over: code = %d, stdout = %s, stderr = %s", code, stdout, stderr)
	}
}
