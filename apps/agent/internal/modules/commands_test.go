package modules_test

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"pupitre.sh/agent/internal/contract"
	"pupitre.sh/agent/internal/modules"
	"pupitre.sh/agent/internal/modules/modtest"
	"pupitre.sh/agent/internal/protocol"
)

var resultDefinitions = map[string]string{
	"catalog":   "CatalogResult",
	"install":   "InstallResult",
	"uninstall": "UninstallResult",
	"upgrade":   "UpgradeResult",
	"report":    "ReportResult",
	"hello":     "HelloResult",
	"ping":      "PingResult",
}

type fixture struct {
	entitlement contract.Entitlement
	upgrades    map[string]string
	input       []string
	secrets     []string
	hasSecrets  bool
	expected    []string
	commands    map[int64]string
}

func parseFixture(t *testing.T, path string) fixture {
	t.Helper()

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	parsed := fixture{entitlement: contract.EntitlementDev, upgrades: map[string]string{}, commands: map[int64]string{}}

	for _, line := range strings.Split(string(raw), "\n") {
		switch {
		case line == "" || strings.HasPrefix(line, "#"):
		case strings.HasPrefix(line, "@entitlement "):
			parsed.entitlement = contract.Entitlement(strings.TrimPrefix(line, "@entitlement "))
		case strings.HasPrefix(line, "@upgrade "):
			fields := strings.Fields(strings.TrimPrefix(line, "@upgrade "))
			parsed.upgrades[fields[0]] = fields[1]
		case strings.HasPrefix(line, "> "):
			request := strings.TrimPrefix(line, "> ")
			parsed.input = append(parsed.input, request)
			parsed.remember(t, request)
		case strings.HasPrefix(line, "$ "):
			parsed.secrets = append(parsed.secrets, strings.TrimPrefix(line, "$ "))
			parsed.hasSecrets = true
		case strings.HasPrefix(line, "< "):
			parsed.expected = append(parsed.expected, strings.TrimPrefix(line, "< "))
		default:
			t.Fatalf("%s: unexpected line %q", path, line)
		}
	}

	return parsed
}

func (f *fixture) remember(t *testing.T, request string) {
	t.Helper()

	var envelope struct {
		ID  int64  `json:"id"`
		Cmd string `json:"cmd"`
	}
	if err := json.Unmarshal([]byte(request), &envelope); err != nil {
		t.Fatalf("request %q: %v", request, err)
	}

	f.commands[envelope.ID] = envelope.Cmd
}

func fixtureRegistry() *modules.Registry {
	return demoRegistry(
		modtest.Passing{ID: "core.system"},
		modtest.Failing{ID: "db.broken", Requires: []string{"core.system"}, FailAt: "install-package", Message: "E: Unable to locate package db-broken"},
		modtest.Passing{ID: "tool.demo", Requires: []string{"core.system"}, Unit: "demo", EnvKey: "DEMO_PASSWORD", Port: 8080},
		modtest.Passing{ID: "tool.rival", Conflicts: []string{"tool.demo"}},
	)
}

func TestFixtures(t *testing.T) {
	paths, err := filepath.Glob("testdata/*.jsonl")
	if err != nil || len(paths) == 0 {
		t.Fatalf("no fixtures found: %v", err)
	}

	for _, path := range paths {
		t.Run(filepath.Base(path), func(t *testing.T) {
			runFixture(t, parseFixture(t, path))
		})
	}
}

func runFixture(t *testing.T, f fixture) {
	t.Helper()

	fixed := func() time.Time { return modtest.Epoch }
	fake := modtest.NewFakeSys()
	for pkg, version := range f.upgrades {
		fake.Upgrades[pkg] = version
	}

	engine := newEngine(t, fake, fixtureRegistry(), entitled(f.entitlement))
	engine.Now = fixed

	server := protocol.NewServer(protocol.Options{AgentVersion: "0.0.0-test", Entitlement: f.entitlement, Now: fixed})
	modules.RegisterCommands(server, engine)

	var secrets io.Reader
	if f.hasSecrets {
		secrets = strings.NewReader(strings.Join(f.secrets, "\n") + "\n")
	}

	var out bytes.Buffer
	if err := server.Serve(strings.NewReader(strings.Join(f.input, "\n")+"\n"), &out, secrets); err != nil {
		t.Fatalf("serve: %v", err)
	}

	got := strings.Split(strings.TrimRight(out.String(), "\n"), "\n")
	if len(got) != len(f.expected) {
		t.Fatalf("got %d lines, want %d\n--- got\n%s\n--- want\n%s", len(got), len(f.expected), out.String(), strings.Join(f.expected, "\n"))
	}

	for i := range got {
		assertContractLine(t, got[i], f.commands)

		want := strings.ReplaceAll(f.expected[i], "%REPORT_PATH%", engine.ReportPath)
		if !reflect.DeepEqual(decodeJSON(t, got[i]), decodeJSON(t, want)) {
			t.Errorf("line %d\n got: %s\nwant: %s", i+1, got[i], want)
		}
	}

	assertNoSecret(t, "protocol output", out.Bytes())
	for _, path := range []string{engine.ReportPath, engine.LogPath} {
		if raw, err := os.ReadFile(path); err == nil {
			assertNoSecret(t, path, raw)
		}
	}
}

func assertContractLine(t *testing.T, line string, commands map[int64]string) {
	t.Helper()

	object, ok := decodeJSON(t, line).(map[string]any)
	if !ok {
		t.Fatalf("output %q is not an object", line)
	}

	id, _ := object["id"].(json.Number).Int64()

	if event, isEvent := object["event"]; isEvent {
		definition := "Event"
		if event == "step" {
			definition = "StepEvent"
		}

		if err := contract.Validate(definition, object); err != nil {
			t.Errorf("output %q violates %s: %v", line, definition, err)
		}
		return
	}

	if err := contract.Validate("Response", object); err != nil {
		t.Errorf("output %q violates Response: %v", line, err)
	}

	definition, known := resultDefinitions[commands[id]]
	if object["ok"] == true && known {
		if err := contract.Validate(definition, object["result"]); err != nil {
			t.Errorf("result of %s violates %s: %v\n%s", commands[id], definition, err, line)
		}
	}
}

func assertNoSecret(t *testing.T, label string, raw []byte) {
	t.Helper()

	if bytes.Contains(raw, []byte(secret)) {
		t.Errorf("secret leaked into %s:\n%s", label, raw)
	}
}

func decodeJSON(t *testing.T, text string) any {
	t.Helper()

	value, err := contract.Decode([]byte(text))
	if err != nil {
		t.Fatalf("invalid JSON %q: %v", text, err)
	}

	return value
}
