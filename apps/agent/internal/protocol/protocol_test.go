package protocol

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/golden"
)

const testAgentVersion = "0.0.0-test"

var fixedNow = func() time.Time {
	return time.Date(2026, time.September, 4, 12, 0, 0, 0, time.UTC)
}

type fixture struct {
	path        string
	entitlement contract.Entitlement
	input       []string
	expected    []string
}

func parseFixture(t *testing.T, path string) fixture {
	t.Helper()

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	parsed := fixture{path: path, entitlement: contract.EntitlementDev}

	for _, line := range strings.Split(string(raw), "\n") {
		switch {
		case line == "" || strings.HasPrefix(line, "#"):
		case strings.HasPrefix(line, "@entitlement "):
			parsed.entitlement = contract.Entitlement(strings.TrimPrefix(line, "@entitlement "))
		case strings.HasPrefix(line, "> "), strings.HasPrefix(line, "$ "):
			parsed.input = append(parsed.input, line[2:])
		case strings.HasPrefix(line, "< "):
			parsed.expected = append(parsed.expected, strings.TrimPrefix(line, "< "))
		default:
			t.Fatalf("%s: unexpected line %q", path, line)
		}
	}

	return parsed
}

func newTestServer(granted contract.Entitlement) *Server {
	server := NewServer(Options{AgentVersion: testAgentVersion, Entitlement: entitlement.Fixed(granted), Now: fixedNow})

	server.Register("probe", func(_ *Context, _ json.RawMessage) (any, error) {
		return nil, NewError(contract.ErrorBusy, "an installation is in progress").WithFix("Wait for the installation to finish.")
	})

	server.Register("project.logs", func(ctx *Context, _ json.RawMessage) (any, error) {
		ctx.Emit("log", map[string]any{"line": "vite v7 ready in 412 ms"})
		ctx.Emit("log", map[string]any{"line": "listening on :5173"})

		return map[string]any{"lines": 2}, nil
	})

	server.Register("install", func(ctx *Context, _ json.RawMessage) (any, error) {
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

	server.Register("enroll", func(ctx *Context, _ json.RawMessage) (any, error) {
		var secrets struct {
			Token string `json:"enrollment_token"`
		}
		if err := json.Unmarshal(ctx.Secrets, &secrets); err != nil || secrets.Token == "" {
			return nil, badRequest("enrolment token missing")
		}

		return map[string]any{"enrolled": true, "entitlement": string(contract.EntitlementValid)}, nil
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

	var out bytes.Buffer
	input := strings.NewReader(strings.Join(f.input, "\n") + "\n")

	if err := newTestServer(f.entitlement).Serve(input, &out); err != nil {
		t.Fatalf("serve: %v", err)
	}

	got := strings.Split(strings.TrimRight(out.String(), "\n"), "\n")
	for _, line := range got {
		assertContractLine(t, line)
	}

	recorded, diverged := recording(t, got, f.expected)
	if !diverged {
		return
	}

	if golden.Updating() {
		if err := golden.Rewrite(f.path, recorded); err != nil {
			t.Fatal(err)
		}

		t.Logf("rewritten from the run: %s", f.path)

		return
	}

	if len(got) != len(f.expected) {
		t.Fatalf("got %d lines, want %d\n--- got\n%s\n--- want\n%s", len(got), len(f.expected), out.String(), strings.Join(f.expected, "\n"))
	}

	for i := range got {
		if !reflect.DeepEqual(decodeJSON(t, got[i]), decodeJSON(t, f.expected[i])) {
			t.Errorf("line %d\n got: %s\nwant: %s", i+1, got[i], f.expected[i])
		}
	}
}

// A line the run only spells differently is kept as the file holds it: a regeneration records what changed, not the whole file.
func recording(t *testing.T, got, want []string) (lines []string, diverged bool) {
	t.Helper()

	lines = make([]string, len(got))
	diverged = len(got) != len(want)

	for i, line := range got {
		lines[i] = line

		if i < len(want) && reflect.DeepEqual(decodeJSON(t, line), decodeJSON(t, want[i])) {
			lines[i] = want[i]
			continue
		}

		diverged = true
	}

	return lines, diverged
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
	input := strings.NewReader(`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":2}}` + "\n" + `{"id":2,"cmd":"ping"}` + "\n")

	if err := newTestServer(contract.EntitlementDev).Serve(input, &out); err != nil {
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

// pupitred dev greets nobody: hello through Call has no session to mark, and must still answer.
func TestHelloAnswersADirectCallWithoutASession(t *testing.T) {
	result, err := newTestServer(contract.EntitlementDev).Call("hello", map[string]any{"app_version": "0.2.0", "protocol": contract.ProtocolVersion}, nil)
	if err != nil {
		t.Fatalf("Call(hello): %v", err)
	}

	if err := contract.ValidateValue("HelloResult", result); err != nil {
		t.Fatal(err)
	}
}

func TestAnIdThatDoesNotGrowIsRefused(t *testing.T) {
	var out bytes.Buffer
	input := strings.NewReader(strings.Join([]string{
		`{"id":7,"cmd":"hello","params":{"app_version":"0.2.0","protocol":2}}`,
		`{"id":7,"cmd":"ping"}`,
		`{"id":3,"cmd":"ping"}`,
		`{"id":8,"cmd":"ping"}`,
	}, "\n") + "\n")

	if err := newTestServer(contract.EntitlementDev).Serve(input, &out); err != nil {
		t.Fatal(err)
	}

	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 4 {
		t.Fatalf("got %d lines:\n%s", len(lines), out.String())
	}

	for _, line := range lines[1:3] {
		if !strings.Contains(line, `"bad_request"`) || !strings.Contains(line, "last id received 7") {
			t.Fatalf("an id that does not grow must be refused and say so: %s", line)
		}
	}

	if !strings.Contains(lines[3], `"ok":true`) {
		t.Fatalf("the next growing id must be served: %s", lines[3])
	}
}

func TestTheSecretLineReachesTheHandlerAndNothingElse(t *testing.T) {
	var out bytes.Buffer
	input := strings.NewReader(strings.Join([]string{
		`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":2}}`,
		`{"id":2,"cmd":"install","params":{"modules":["tool.github"],"config":{},"secrets_stdin":true}}`,
		`{"API_KEY":"s3cret-de-test"}`,
	}, "\n") + "\n")

	if err := newTestServer(contract.EntitlementDev).Serve(input, &out); err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(out.String(), `"keys":["API_KEY"]`) {
		t.Fatalf("the handler never saw the secret line:\n%s", out.String())
	}

	if strings.Contains(out.String(), "s3cret-de-test") {
		t.Fatalf("the secret reached the output:\n%s", out.String())
	}
}

func TestServeSurvivesInvalidInputAndReturnsNilAtEOF(t *testing.T) {
	var out bytes.Buffer
	input := strings.NewReader("\x00\xff\n\n   \n{\"id\":1,\"cmd\":\"hello\",\"params\":{\"app_version\":\"0.2.0\",\"protocol\":2}}")

	if err := newTestServer(contract.EntitlementDev).Serve(input, &out); err != nil {
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
	server := NewServer(Options{AgentVersion: testAgentVersion, Entitlement: entitlement.Fixed(contract.EntitlementDev)})

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
	want := []string{"enroll", "hello", "install", "ping", "probe", "project.logs", "reboot"}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("capabilities = %v, want %v", got, want)
	}
}

func TestErrorUnwrapsAsProtocolError(t *testing.T) {
	err := NewError(contract.ErrorBusy, "busy")

	var protocolErr *Error
	if !errors.As(err, &protocolErr) || protocolErr.Code != contract.ErrorBusy {
		t.Fatalf("errors.As failed on %v", err)
	}
}

// A writer that goes the way of a dropped SSH session: it takes a few lines,
// then refuses every one that follows.
type droppingWriter struct {
	keep   int
	buffer bytes.Buffer
}

func (w *droppingWriter) Write(p []byte) (int, error) {
	if w.keep == 0 {
		return 0, errors.New("write: broken pipe")
	}
	w.keep--

	return w.buffer.Write(p)
}

func TestACommandOutlivesTheChannelThatCarriedIt(t *testing.T) {
	server := NewServer(Options{AgentVersion: testAgentVersion, Entitlement: entitlement.Fixed(contract.EntitlementDev), Now: fixedNow})

	steps := 0
	server.Register("install", func(ctx *Context, _ json.RawMessage) (any, error) {
		for _, step := range []string{"apt", "cluster", "role"} {
			ctx.Emit("step", map[string]any{"module": "db.postgres", "step": step, "status": "ok", "ms": 1})
			steps++
		}

		return map[string]any{"failed": []string{}, "warned": []string{}, "report_path": "/var/lib/pupitre/report.json"}, nil
	})

	input := strings.NewReader(strings.Join([]string{
		`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":2}}`,
		`{"id":2,"cmd":"install","params":{"modules":["db.postgres"],"config":{},"secrets_stdin":false}}`,
	}, "\n") + "\n")

	out := &droppingWriter{keep: 2}
	err := server.Serve(input, out)

	if err == nil || !strings.Contains(err.Error(), "broken pipe") {
		t.Fatalf("serve returned %v, want the write failure", err)
	}

	if steps != 3 {
		t.Fatalf("the command stopped with the channel: %d step(s) of 3", steps)
	}
}
