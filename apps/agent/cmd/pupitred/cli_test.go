package main

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/platform"
	"pupitre.studio/agent/internal/probe"
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
	t.Setenv("PUPITRE_LOCK_PATH", filepath.Join(dir, "install.lock"))
	t.Setenv("PUPITRE_PROJECTS_LOCK_PATH", filepath.Join(dir, "projects.lock"))
	t.Setenv("PUPITRE_UPGRADE_LOCK_PATH", filepath.Join(dir, "upgrade.lock"))
	t.Setenv("PUPITRE_KEYS_LOCK_PATH", filepath.Join(dir, "keys.lock"))

	// `dev` follows the shell that types it, and the locale lives at the package
	// level: without this, a French laptop renders every phrase below in French.
	t.Setenv("PUPITRE_LOCALE", "en")
	enrol(t, fake)

	return fake, dir
}

// A server as it stands just after its enrolment: a server token, and a platform read that is still fresh.
func enrol(t *testing.T, fake *modtest.FakeSys) {
	t.Helper()

	now := time.Now()
	cache, err := json.Marshal(entitlement.Cache{State: "valid", ValidUntil: now.Add(24 * time.Hour), CheckedAt: now})
	if err != nil {
		t.Fatal(err)
	}

	fake.Files[platform.DefaultTokenPath] = []byte("jeton-de-serveur\n")
	fake.Files[entitlement.DefaultCachePath] = cache
}

// The same binary, on a server it was never enrolled on.
func unenrol(fake *modtest.FakeSys) {
	delete(fake.Files, platform.DefaultTokenPath)
	delete(fake.Files, entitlement.DefaultCachePath)
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
	if code != 2 || !strings.Contains(stderr, "unknown argument") {
		t.Fatalf("code = %d, stderr = %s", code, stderr)
	}
}

func TestReportWithoutInstall(t *testing.T) {
	setupCLI(t)

	code, stdout, stderr := runCLI(t, "report")
	if code != 1 || stdout != "" || !strings.Contains(stderr, "no_report : no report") {
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

	code, stdout, _ = runCLI(t, "version", "--json")
	if code != 0 || stdout != `{"version":"`+version+`","protocol":`+strconv.Itoa(contract.ProtocolVersion)+"}\n" {
		t.Fatalf("the agent upgrading to this binary reads its protocol here: code = %d, stdout = %q", code, stdout)
	}
}

func TestProbeWritesTheContractResultAndTheScript(t *testing.T) {
	setupCLI(t)

	code, stdout, stderr := runCLI(t, "probe")
	if code != 0 || stderr != "" {
		t.Fatalf("code = %d, stderr = %s", code, stderr)
	}

	value, err := contract.Decode([]byte(stdout))
	if err != nil {
		t.Fatalf("probe output is not JSON: %v\n%s", err, stdout)
	}

	if _, ok := value.(map[string]any)["verdict"]; !ok {
		t.Fatalf("probe output lacks a verdict: %s", stdout)
	}

	code, stdout, _ = runCLI(t, "probe", "--script")
	if code != 0 || stdout != probe.Script {
		t.Fatalf("code = %d, --script must hand back probe.sh verbatim", code)
	}

	code, _, stderr = runCLI(t, "probe", "--bogus")
	if code != 2 || !strings.Contains(stderr, "unknown argument") {
		t.Fatalf("code = %d, stderr = %s", code, stderr)
	}
}
