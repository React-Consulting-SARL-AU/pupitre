package main

import (
	"bytes"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
)

func serveLines(t *testing.T, lines ...string) []string {
	t.Helper()

	setupCLI(t)

	return serveOn(t, lines...)
}

func serveOn(t *testing.T, lines ...string) []string {
	t.Helper()

	var out bytes.Buffer
	if err := newServer(newEngine()).Serve(strings.NewReader(strings.Join(lines, "\n")+"\n"), &out); err != nil {
		t.Fatalf("serve: %v", err)
	}

	return strings.Split(strings.TrimSpace(out.String()), "\n")
}

func decodeResponse(t *testing.T, line string) map[string]any {
	t.Helper()

	value, err := contract.Decode([]byte(line))
	if err != nil {
		t.Fatalf("decode %q: %v", line, err)
	}

	if err := contract.Validate("Response", value); err != nil {
		t.Fatalf("%q violates Response: %v", line, err)
	}

	return value.(map[string]any)
}

func errorCode(t *testing.T, line string) string {
	t.Helper()

	response := decodeResponse(t, line)
	if response["ok"] != false {
		t.Fatalf("expected a failure, got %s", line)
	}

	return response["error"].(map[string]any)["code"].(string)
}

func TestServeNegotiatesHelloThenAnswersPing(t *testing.T) {
	lines := serveLines(t,
		`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":1}}`,
		`{"id":2,"cmd":"ping"}`,
		`{"id":3,"cmd":"snapshot"}`,
	)

	if len(lines) != 3 {
		t.Fatalf("got %d lines: %v", len(lines), lines)
	}

	hello := decodeResponse(t, lines[0])
	if hello["ok"] != true {
		t.Fatalf("hello failed: %s", lines[0])
	}

	result := hello["result"].(map[string]any)
	if err := contract.Validate("HelloResult", result); err != nil {
		t.Fatalf("hello result violates HelloResult: %v", err)
	}

	if result["agent_version"] != version || result["entitlement"] != string(contract.EntitlementValid) {
		t.Fatalf("unexpected hello result: %v", result)
	}

	ping := decodeResponse(t, lines[1])
	if ping["ok"] != true {
		t.Fatalf("ping failed: %s", lines[1])
	}

	if _, ok := ping["result"].(map[string]any)["ts"].(string); !ok {
		t.Fatalf("ping result lacks ts: %s", lines[1])
	}

	snapshot := decodeResponse(t, lines[2])
	if snapshot["ok"] != true {
		t.Fatalf("snapshot failed: %s", lines[2])
	}

	if err := contract.Validate("SnapshotResult", snapshot["result"]); err != nil {
		t.Fatalf("snapshot result violates SnapshotResult: %v", err)
	}
}

func TestServeRequiresHello(t *testing.T) {
	lines := serveLines(t, `{"id":1,"cmd":"ping"}`)

	if code := errorCode(t, lines[0]); code != "hello_required" {
		t.Fatalf("got %s, want hello_required", code)
	}
}

func TestServeRejectsInvalidJSONAndKeepsGoing(t *testing.T) {
	lines := serveLines(t,
		"not json",
		`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":1}}`,
	)

	if code := errorCode(t, lines[0]); code != "bad_request" {
		t.Fatalf("got %s, want bad_request", code)
	}

	if decodeResponse(t, lines[1])["ok"] != true {
		t.Fatalf("hello after a bad line failed: %s", lines[1])
	}
}
