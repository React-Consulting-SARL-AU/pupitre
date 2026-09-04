package protocol

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
)

const testAgentVersion = "0.0.0-test"

var fixedNow = func() time.Time {
	return time.Date(2026, time.September, 4, 12, 0, 0, 0, time.UTC)
}

type fixture struct {
	entitlement contract.Entitlement
	input       []string
	secrets     []string
	hasSecrets  bool
	expected    []string
}

func parseFixture(t *testing.T, path string) fixture {
	t.Helper()

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	parsed := fixture{entitlement: contract.EntitlementDev}

	for _, line := range strings.Split(string(raw), "\n") {
		switch {
		case line == "" || strings.HasPrefix(line, "#"):
		case strings.HasPrefix(line, "@entitlement "):
			parsed.entitlement = contract.Entitlement(strings.TrimPrefix(line, "@entitlement "))
		case strings.HasPrefix(line, "> "):
			parsed.input = append(parsed.input, strings.TrimPrefix(line, "> "))
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

func newTestServer(entitlement contract.Entitlement) *Server {
	server := NewServer(Options{AgentVersion: testAgentVersion, Entitlement: entitlement, Now: fixedNow})

	server.Register("probe", func(_ *Context, _ json.RawMessage) (any, error) {
		return nil, NewError(contract.ErrorBusy, "une installation est en cours").WithFix("Attends la fin de l'installation.")
	})

	server.Register("project.logs", func(ctx *Context, _ json.RawMessage) (any, error) {
		ctx.Emit("log", map[string]any{"line": "vite v7 ready in 412 ms"})
		ctx.Emit("log", map[string]any{"line": "listening on :5173"})

		return map[string]any{"lines": 2}, nil
	})

	server.Register("secrets.set", func(ctx *Context, _ json.RawMessage) (any, error) {
		var secrets map[string]json.RawMessage
		if err := json.Unmarshal(ctx.Secrets, &secrets); err != nil {
			return nil, err
		}

		keys := make([]string, 0, len(secrets))
		for key := range secrets {
			keys = append(keys, key)
		}
		sort.Strings(keys)

		return map[string]any{"keys": keys}, nil
	})

	server.Register("reboot", func(_ *Context, _ json.RawMessage) (any, error) {
		panic("boom")
	})

	return server
}

func decodeJSON(t *testing.T, text string) any {
	t.Helper()

	value, err := contract.Decode([]byte(text))
	if err != nil {
		t.Fatalf("invalid JSON %q: %v", text, err)
	}

	return value
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

	var secrets io.Reader
	if f.hasSecrets {
		secrets = strings.NewReader(strings.Join(f.secrets, "\n") + "\n")
	}

	var out bytes.Buffer
	input := strings.NewReader(strings.Join(f.input, "\n") + "\n")

	if err := newTestServer(f.entitlement).Serve(input, &out, secrets); err != nil {
		t.Fatalf("serve: %v", err)
	}

	got := strings.Split(strings.TrimRight(out.String(), "\n"), "\n")
	if len(got) != len(f.expected) {
		t.Fatalf("got %d lines, want %d\n--- got\n%s\n--- want\n%s", len(got), len(f.expected), out.String(), strings.Join(f.expected, "\n"))
	}

	for i := range got {
		assertContractLine(t, got[i])

		if !reflect.DeepEqual(decodeJSON(t, got[i]), decodeJSON(t, f.expected[i])) {
			t.Errorf("line %d\n got: %s\nwant: %s", i+1, got[i], f.expected[i])
		}
	}
}

func assertContractLine(t *testing.T, line string) {
	t.Helper()

	value := decodeJSON(t, line)
	object, ok := value.(map[string]any)
	if !ok {
		t.Fatalf("output %q is not an object", line)
	}

	definition := "Response"
	if _, isEvent := object["event"]; isEvent {
		definition = "Event"
	}

	if err := contract.Validate(definition, value); err != nil {
		t.Errorf("output %q violates %s: %v", line, definition, err)
	}
}

func TestHelloResultMatchesTheContract(t *testing.T) {
	var out bytes.Buffer
	input := strings.NewReader(`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":1}}` + "\n" + `{"id":2,"cmd":"ping"}` + "\n")

	if err := newTestServer(contract.EntitlementDev).Serve(input, &out, nil); err != nil {
		t.Fatal(err)
	}

	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	for i, definition := range []string{"HelloResult", "PingResult"} {
		object := decodeJSON(t, lines[i]).(map[string]any)

		if err := contract.Validate(definition, object["result"]); err != nil {
			t.Errorf("%s: %v", definition, err)
		}
	}
}

func TestServeSurvivesInvalidInputAndReturnsNilAtEOF(t *testing.T) {
	var out bytes.Buffer
	input := strings.NewReader("\x00\xff\n\n   \n{\"id\":1,\"cmd\":\"hello\",\"params\":{\"app_version\":\"0.2.0\",\"protocol\":1}}")

	if err := newTestServer(contract.EntitlementDev).Serve(input, &out, nil); err != nil {
		t.Fatalf("serve: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 2 {
		t.Fatalf("got %d lines, want 2:\n%s", len(lines), out.String())
	}

	if !strings.Contains(lines[0], `"bad_request"`) || !strings.Contains(lines[1], `"ok":true`) {
		t.Fatalf("unexpected output:\n%s", out.String())
	}
}

func TestRegisterRefusesCommandsOutsideTheContract(t *testing.T) {
	server := NewServer(Options{AgentVersion: testAgentVersion, Entitlement: contract.EntitlementDev})

	assertPanics(t, "unknown command", func() {
		server.Register("nope", func(_ *Context, _ json.RawMessage) (any, error) { return nil, nil })
	})

	assertPanics(t, "duplicate command", func() {
		server.Register("ping", func(_ *Context, _ json.RawMessage) (any, error) { return nil, nil })
	})
}

func assertPanics(t *testing.T, label string, fn func()) {
	t.Helper()

	defer func() {
		if recover() == nil {
			t.Errorf("%s: expected a panic", label)
		}
	}()

	fn()
}

func TestCapabilitiesAreSorted(t *testing.T) {
	got := newTestServer(contract.EntitlementDev).Capabilities()
	want := []string{"hello", "ping", "probe", "project.logs", "reboot", "secrets.set"}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("capabilities = %v, want %v", got, want)
	}
}

func TestErrorUnwrapsAsProtocolError(t *testing.T) {
	err := NewError(contract.ErrorBusy, "occupé")

	var protocolErr *Error
	if !errors.As(err, &protocolErr) || protocolErr.Code != contract.ErrorBusy {
		t.Fatalf("errors.As failed on %v", err)
	}
}
