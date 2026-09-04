package main

import (
	"bytes"
	"path/filepath"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sys"
)

func init() {
	modules.Register(modtest.Passing{ID: "tool.demo", Unit: "demo", EnvKey: "DEMO_PASSWORD"})
	modules.Register(modtest.Failing{ID: "db.broken", FailAt: "install-package", Message: "E: Unable to locate package db-broken"})
}

func setupCLI(t *testing.T) (*modtest.FakeSys, string) {
	t.Helper()

	fake := modtest.NewFakeSys()
	previous := newSys
	newSys = func() sys.Sys { return fake }
	t.Cleanup(func() { newSys = previous })

	dir := t.TempDir()
	t.Setenv("PUPITRE_REPORT_PATH", filepath.Join(dir, "report.json"))
	t.Setenv("PUPITRE_LOG_PATH", filepath.Join(dir, "pupitre.log"))
	t.Setenv("PUPITRE_INSTALL_PATH", filepath.Join(dir, "install.json"))

	return fake, dir
}

func runCLI(t *testing.T, args ...string) (int, string, string) {
	t.Helper()

	var stdout, stderr bytes.Buffer
	code := run(args, strings.NewReader(""), &stdout, &stderr)

	return code, stdout.String(), stderr.String()
}

func TestInstallWithoutConfigurationNorOnly(t *testing.T) {
	setupCLI(t)

	code, _, stderr := runCLI(t, "install")
	if code != 2 || !strings.Contains(stderr, "--only") {
		t.Fatalf("code = %d, stderr = %s", code, stderr)
	}

	code, _, stderr = runCLI(t, "install", "--bogus")
	if code != 2 || !strings.Contains(stderr, "argument inconnu") {
		t.Fatalf("code = %d, stderr = %s", code, stderr)
	}
}

func TestReportWithoutInstall(t *testing.T) {
	setupCLI(t)

	code, stdout, stderr := runCLI(t, "report")
	if code != 1 || stdout != "" || !strings.Contains(stderr, "no_report : aucun rapport") {
		t.Fatalf("code = %d, stdout = %q, stderr = %s", code, stdout, stderr)
	}
}

func TestUsageAndVersion(t *testing.T) {
	code, _, stderr := runCLI(t)
	if code != 2 || !strings.Contains(stderr, "usage") {
		t.Fatalf("code = %d, stderr = %s", code, stderr)
	}

	code, stdout, _ := runCLI(t, "version")
	if code != 0 || stdout != "pupitred "+version+"\n" {
		t.Fatalf("code = %d, stdout = %q", code, stdout)
	}
}
