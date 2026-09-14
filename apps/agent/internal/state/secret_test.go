package state_test

import (
	"bufio"
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/state"
)

const mysqlPassword = "mysql-real-8f3a2c"

const postgresPassword = "postgres-real-1b7e"

func revealFixture(t *testing.T) (*modtest.FakeSys, *state.Reader, string) {
	t.Helper()

	fake := modtest.NewFakeSys()
	fake.Packages["db-mysql"] = "8.0.0"
	fake.Packages["db-postgres"] = "17.0"
	fake.Files["/etc/pupitre/env"] = []byte(
		"MYSQL_APP_PASSWORD=" + mysqlPassword + "\n" +
			"POSTGRES_APP_PASSWORD=" + postgresPassword + "\n",
	)

	catalog := modules.NewRegistry()
	catalog.Register(modtest.Passing{ID: "db.mysql", EnvKey: "MYSQL_APP_PASSWORD"})
	catalog.Register(modtest.Passing{ID: "db.postgres", EnvKey: "POSTGRES_APP_PASSWORD"})

	logPath := filepath.Join(t.TempDir(), "pupitre.log")

	reader := state.New(state.Options{
		Sys:          fake,
		Now:          modtest.NewClock(time.Millisecond).Now,
		Registry:     catalog,
		Entitlement:  func() contract.Entitlement { return contract.EntitlementDev },
		AgentVersion: "0.0.0-test",
	}).WithJournal(logPath)

	return fake, reader, logPath
}

func serveRequests(t *testing.T, reader *state.Reader, requests ...string) []map[string]any {
	t.Helper()

	granted := entitlement.State{Entitlement: contract.EntitlementDev, Enrolled: true}
	server := protocol.NewServer(protocol.Options{
		AgentVersion: "0.0.0-test",
		Entitlement:  func() entitlement.State { return granted },
		Now:          func() time.Time { return modtest.Epoch },
	})
	state.RegisterCommands(server, reader)

	var out bytes.Buffer
	input := strings.Join(requests, "\n") + "\n"
	if err := server.Serve(strings.NewReader(input), &out); err != nil {
		t.Fatalf("serve: %v", err)
	}

	var lines []map[string]any
	scanner := bufio.NewScanner(&out)
	scanner.Buffer(make([]byte, 0, 1<<20), 1<<20)
	for scanner.Scan() {
		var line map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &line); err != nil {
			t.Fatalf("output %q: %v", scanner.Text(), err)
		}

		lines = append(lines, line)
	}

	return lines
}

const helloRequest = `{"id":1,"cmd":"hello","params":{"app_version":"0.0.0-test","protocol":2}}`

func TestServiceSecretRevealsTheRealValueOnASecretEvent(t *testing.T) {
	_, reader, logPath := revealFixture(t)

	lines := serveRequests(t, reader, helloRequest,
		`{"id":2,"cmd":"service.secret","params":{"id":"db.mysql","key":"MYSQL_APP_PASSWORD"}}`,
	)

	var event, response map[string]any
	for _, line := range lines {
		if line["event"] == "secret" {
			event = line
		}

		if line["id"] == float64(2) && line["ok"] != nil {
			response = line
		}
	}

	if event == nil {
		t.Fatal("no secret event on the stream")
	}

	if event["value"] != mysqlPassword {
		t.Fatalf("secret event carries %q, want the real value %q", event["value"], mysqlPassword)
	}

	if event["key"] != "MYSQL_APP_PASSWORD" {
		t.Fatalf("secret event names %q, want MYSQL_APP_PASSWORD", event["key"])
	}

	if response == nil || response["ok"] != true {
		t.Fatalf("no success response for the reveal: %v", response)
	}

	result, _ := response["result"].(map[string]any)
	if result["key"] != "MYSQL_APP_PASSWORD" {
		t.Fatalf("ack names %q, want MYSQL_APP_PASSWORD", result["key"])
	}

	if _, leaked := result["value"]; leaked {
		t.Fatalf("the value leaked into the result envelope: %v", result)
	}

	if raw, err := json.Marshal(response); err == nil && bytes.Contains(raw, []byte(mysqlPassword)) {
		t.Fatalf("the value leaked into the response line: %s", raw)
	}

	journal, err := os.ReadFile(logPath)
	if err == nil && bytes.Contains(journal, []byte(mysqlPassword)) {
		t.Fatalf("the value leaked into the agent journal:\n%s", journal)
	}
}

func TestServiceSecretRefusesAKeyOfAnotherModule(t *testing.T) {
	_, reader, logPath := revealFixture(t)

	_, err := reader.ServiceSecret("db.mysql", "POSTGRES_APP_PASSWORD")
	if err == nil {
		t.Fatal("reading a foreign module's key must be refused")
	}

	failure, ok := err.(*protocol.Error)
	if !ok || failure.Code != contract.ErrorBadRequest {
		t.Fatalf("want bad_request, got %v", err)
	}

	if strings.Contains(err.Error(), postgresPassword) {
		t.Fatalf("the refusal quoted the value: %v", err)
	}

	journal, readErr := os.ReadFile(logPath)
	if readErr == nil && bytes.Contains(journal, []byte(postgresPassword)) {
		t.Fatalf("a value leaked into the agent journal:\n%s", journal)
	}
}

func TestServiceSecretRefusesAnUnknownKeyAndModule(t *testing.T) {
	_, reader, _ := revealFixture(t)

	if _, err := reader.ServiceSecret("db.mysql", "GITHUB_TOKEN"); err == nil {
		t.Fatal("a key the module does not own must be refused")
	}

	_, err := reader.ServiceSecret("db.redis", "REDIS_PASSWORD")
	failure, ok := err.(*protocol.Error)
	if !ok || failure.Code != contract.ErrorServiceNotFound {
		t.Fatalf("an unknown module must be service_not_found, got %v", err)
	}
}
