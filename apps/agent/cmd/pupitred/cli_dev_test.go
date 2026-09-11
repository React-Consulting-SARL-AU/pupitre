//go:build dev

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
)

func TestInstallRunsOnADevBuild(t *testing.T) {
	fake, dir := setupCLI(t)
	writeInstallJSON(t, dir, modules.Request{
		Modules: []string{"tool.demo", "db.broken"},
		Config:  map[string]map[string]any{"tool.demo": {"port": 9000}},
		Secrets: map[string]map[string]string{"tool.demo": {"password": "s3cret-de-test"}},
	})

	code, _, stderr := runCLI(t, "install")
	if code != 1 {
		t.Fatalf("code = %d, stderr:\n%s", code, stderr)
	}

	for _, want := range []string{
		"✓ tool.demo · install-package",
		"✗ db.broken · install-package",
		"replay: sudo pupitred install --only=db.broken",
		"1 failed step(s)",
	} {
		if !strings.Contains(stderr, want) {
			t.Errorf("stderr lacks %q:\n%s", want, stderr)
		}
	}

	if strings.Contains(stderr, "s3cret-de-test") {
		t.Fatal("secret printed on the terminal")
	}

	if string(fake.Files["/etc/pupitre/demo/tool.demo.conf"]) != "port=9000\n" || fake.EnvValue("DEMO_PASSWORD") != "s3cret-de-test" {
		t.Fatalf("install.json values were not applied: %v", fake.Files)
	}

	code, stdout, _ := runCLI(t, "report")
	if code != 0 {
		t.Fatalf("report code = %d", code)
	}

	report := decodeReport(t, stdout)
	if len(report.Failed) != 1 || report.Modules[0].Status != contract.ModuleFail {
		t.Fatalf("unexpected report: %+v", report)
	}

	t.Logf("pupitred install (dev build):\n%s", stderr)
	t.Logf("pupitred report:\n%s", stdout)
}

func TestInstallOnlyAndSkipFilterTheRequest(t *testing.T) {
	fake, dir := setupCLI(t)
	writeInstallJSON(t, dir, modules.Request{
		Modules: []string{"tool.demo", "db.broken"},
		Secrets: map[string]map[string]string{"tool.demo": {"password": "s3cret-de-test"}},
	})

	code, _, stderr := runCLI(t, "install", "--skip=db.broken")
	if code != 0 || strings.Contains(stderr, "db.broken") || !strings.Contains(stderr, "No failed step") {
		t.Fatalf("code = %d, stderr:\n%s", code, stderr)
	}

	code, _, stderr = runCLI(t, "install", "--only=tool.demo")
	if code != 0 || !strings.Contains(stderr, "· tool.demo · install-package (already done)") {
		t.Fatalf("replay code = %d, stderr:\n%s", code, stderr)
	}

	if fake.Packages["tool-demo"] == "" {
		t.Fatal("tool.demo not installed")
	}
}

func writeInstallJSON(t *testing.T, dir string, request modules.Request) {
	t.Helper()

	raw, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(dir, "install.json"), raw, 0o600); err != nil {
		t.Fatal(err)
	}
}

func decodeReport(t *testing.T, stdout string) contract.Report {
	t.Helper()

	value, err := contract.Decode([]byte(stdout))
	if err != nil {
		t.Fatalf("report is not JSON: %v\n%s", err, stdout)
	}

	if err := contract.Validate("ReportResult", value); err != nil {
		t.Fatalf("report violates ReportResult: %v", err)
	}

	var report contract.Report
	if err := json.Unmarshal([]byte(stdout), &report); err != nil {
		t.Fatal(err)
	}

	return report
}

// The app left a module for later; naming it on the machine is what answers for it.
func TestInstallOnlyAnswersForAModuleLeftForLater(t *testing.T) {
	fake, dir := setupCLI(t)
	writeInstallJSON(t, dir, modules.Request{
		Modules: []string{"tool.demo"},
		Defer:   []string{"tool.demo"},
		Secrets: map[string]map[string]string{"tool.demo": {"password": "s3cret-de-test"}},
	})

	code, _, stderr := runCLI(t, "install")
	if code != 0 || strings.Contains(stderr, "tool.demo · write-config") {
		t.Fatalf("a plain replay must leave a deferred module unconfigured, code = %d:\n%s", code, stderr)
	}

	code, _, stderr = runCLI(t, "install", "--only=tool.demo")
	if code != 0 || !strings.Contains(stderr, "✓ tool.demo · write-config") {
		t.Fatalf("code = %d, stderr:\n%s", code, stderr)
	}

	if fake.EnvValue("DEMO_PASSWORD") != "s3cret-de-test" {
		t.Fatal("the named replay did not configure the module")
	}

	// The engine writes through the machine it was given, not through the file the CLI read.
	if raw := fake.Files[filepath.Join(dir, "install.json")]; strings.Contains(string(raw), `"defer"`) {
		t.Fatalf("install.json still defers tool.demo:\n%s", raw)
	}
}
