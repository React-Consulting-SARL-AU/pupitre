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
	"pupitre.studio/agent/internal/golden"
	"pupitre.studio/agent/internal/license"
)

const testAgentVersion = "0.0.0-test"

var fixedNow = func() time.Time {
	return time.Date(2026, time.September, 4, 12, 0, 0, 0, time.UTC)
}

type fixture struct {
	path     string
	license  contract.License
	input    []string
	expected []string
}

func parseFixture(t *testing.T, path string) fixture {
	t.Helper()

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	parsed := fixture{path: path, license: contract.LicenseDev}

	for _, line := range strings.Split(string(raw), "\n") {
		switch {
		case line == "" || strings.HasPrefix(line, "#"):
		case strings.HasPrefix(line, "@license "):
			parsed.license = contract.License(strings.TrimPrefix(line, "@license "))
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

func newTestServer(granted contract.License) *Server {
	server := NewServer(Options{AgentVersion: testAgentVersion, License: license.Fixed(granted), Now: fixedNow})

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

		return map[string]any{"enrolled": true, "license": string(contract.LicenseValid)}, nil
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

	if err := newTestServer(f.license).Serve(input, &out); err != nil {
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

// Lines that only differ in spelling keep the file's version, so a regeneration diff shows real changes only.
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
	input := strings.NewReader(`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":3}}` + "\n" + `{"id":2,"cmd":"ping"}` + "\n")

	if err := newTestServer(contract.LicenseDev).Serve(input, &out); err != nil {
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

func TestHelloAnswersADirectCallWithoutASession(t *testing.T) {
	result, err := newTestServer(contract.LicenseDev).Call("hello", map[string]any{"app_version": "0.2.0", "protocol": contract.ProtocolVersion}, nil)
	if err != nil {
		t.Fatalf("Call(hello): %v", err)
	}

	if err := contract.ValidateValue("HelloResult", result); err != nil {
		t.Fatal(err)
	}
}

func TestHelloNamesTheServerOnceThePlatformHas(t *testing.T) {
	named := ""
	server := NewServer(Options{AgentVersion: "1.0.0", ServerID: func() string { return named }})
	params := map[string]any{"app_version": "1.0.0", "protocol": contract.ProtocolVersion}

	unnamed, err := server.Call("hello", params, nil)
	if err != nil {
		t.Fatal(err)
	}

	if encoded, _ := json.Marshal(unnamed); strings.Contains(string(encoded), "server_id") {
		t.Fatalf("hello = %s", encoded)
	}

	named = "srv_42"
	result, err := server.Call("hello", params, nil)
	if err != nil {
		t.Fatal(err)
	}

	if encoded, _ := json.Marshal(result); !strings.Contains(string(encoded), `"server_id":"srv_42"`) {
		t.Fatalf("hello = %s", encoded)
	}
}

func TestHelloRefusesAnAppBelowTheAgentsFloorOnTheSameProtocol(t *testing.T) {
	server := NewServer(Options{AgentVersion: "1.0.0", Now: fixedNow})

	_, err := server.Call("hello", map[string]any{"app_version": "0.9.1", "protocol": contract.ProtocolVersion, "locale": "en"}, nil)

	var refused *Error
	if !errors.As(err, &refused) || refused.Code != contract.ErrorProtocolMismatch {
		t.Fatalf("hello from app 0.9.1 = %v, want protocol_mismatch", err)
	}

	if !strings.Contains(refused.Message, "0.9.1") || !strings.Contains(refused.Fix, "1.0.0") {
		t.Fatalf("the refusal must name the app and the version to reach: %+v", refused)
	}

	for _, app := range []string{"1.0.0", "1.4.2", "1.0.0-rc.1", "dev"} {
		if _, err := server.Call("hello", map[string]any{"app_version": app, "protocol": contract.ProtocolVersion}, nil); err != nil {
			t.Errorf("hello from app %q: %v", app, err)
		}
	}
}

func TestHelloStillAnswersANewerAgentThanTheSheetKnows(t *testing.T) {
	server := NewServer(Options{AgentVersion: "0.9.1", Now: fixedNow})

	if _, err := server.Call("hello", map[string]any{"app_version": "1.0.0", "protocol": contract.ProtocolVersion}, nil); err != nil {
		t.Fatalf("an older agent must keep answering a newer app, which upgrades it: %v", err)
	}
}

func TestAnIdThatDoesNotGrowIsRefused(t *testing.T) {
	var out bytes.Buffer
	input := strings.NewReader(strings.Join([]string{
		`{"id":7,"cmd":"hello","params":{"app_version":"0.2.0","protocol":3}}`,
		`{"id":7,"cmd":"ping"}`,
		`{"id":3,"cmd":"ping"}`,
		`{"id":8,"cmd":"ping"}`,
	}, "\n") + "\n")

	if err := newTestServer(contract.LicenseDev).Serve(input, &out); err != nil {
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
		`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":3}}`,
		`{"id":2,"cmd":"install","params":{"modules":["tool.github"],"config":{},"secrets_stdin":true}}`,
		`{"API_KEY":"s3cret-de-test"}`,
	}, "\n") + "\n")

	if err := newTestServer(contract.LicenseDev).Serve(input, &out); err != nil {
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
	input := strings.NewReader("\x00\xff\n\n   \n{\"id\":1,\"cmd\":\"hello\",\"params\":{\"app_version\":\"0.2.0\",\"protocol\":3}}")

	if err := newTestServer(contract.LicenseDev).Serve(input, &out); err != nil {
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

func TestALinePastTheLimitIsRefusedAndEndsTheSession(t *testing.T) {
	var out bytes.Buffer
	flood := strings.Repeat("a", lineLimit+1024)
	input := strings.NewReader(
		`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":3}}` + "\n" + flood + "\n",
	)

	if err := newTestServer(contract.LicenseDev).Serve(input, &out); err == nil {
		t.Fatal("a flood must end the session, not pass as EOF")
	}

	if !strings.Contains(out.String(), "protocol.line") && !strings.Contains(out.String(), "quatre mébioctets") && !strings.Contains(out.String(), "four mebibytes") {
		t.Fatalf("the flood must be refused with the limit said:\n%s", out.String())
	}
}

func TestTheLargestLegalLineStillPasses(t *testing.T) {
	var out bytes.Buffer
	// Stands in for the largest real line, an fs.write just under the cap.
	padded := `{"id":2,"cmd":"ping","params":{}}` + strings.Repeat(" ", lineLimit-len(`{"id":2,"cmd":"ping","params":{}}`)-1)
	input := strings.NewReader(
		`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":3}}` + "\n" + padded + "\n",
	)

	if err := newTestServer(contract.LicenseDev).Serve(input, &out); err != nil {
		t.Fatalf("serve: %v", err)
	}

	if !strings.Contains(out.String(), `"ok":true,"result":{"ts"`) {
		t.Fatalf("the padded line must be served:\n%s", out.String())
	}
}

func TestRegisterRefusesCommandsOutsideTheContract(t *testing.T) {
	server := NewServer(Options{AgentVersion: testAgentVersion, License: license.Fixed(contract.LicenseDev)})

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
	got := newTestServer(contract.LicenseDev).Capabilities()
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
	server := NewServer(Options{AgentVersion: testAgentVersion, License: license.Fixed(contract.LicenseDev), Now: fixedNow})

	steps := 0
	server.Register("install", func(ctx *Context, _ json.RawMessage) (any, error) {
		for _, step := range []string{"apt", "cluster", "role"} {
			ctx.Emit("step", map[string]any{"module": "db.postgres", "step": step, "status": "ok", "ms": 1})
			steps++
		}

		return map[string]any{"failed": []string{}, "warned": []string{}, "report_path": "/var/lib/pupitre/report.json"}, nil
	})

	input := strings.NewReader(strings.Join([]string{
		`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":3}}`,
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

func TestTheChannelContextEndsWhenStandardInputCloses(t *testing.T) {
	server := NewServer(Options{AgentVersion: testAgentVersion, License: license.Fixed(contract.LicenseDev), Now: fixedNow})

	released := make(chan bool, 1)
	server.Register("project.logs", func(ctx *Context, _ json.RawMessage) (any, error) {
		select {
		case <-ctx.Channel().Done():
			released <- true
		case <-time.After(5 * time.Second):
			released <- false
		}

		return map[string]any{"lines": []string{}}, nil
	})

	reader, writer := io.Pipe()
	var out bytes.Buffer
	served := make(chan error, 1)
	go func() { served <- server.Serve(reader, &out) }()

	io.WriteString(writer, `{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":3}}`+"\n")
	io.WriteString(writer, `{"id":2,"cmd":"project.logs","params":{"name":"web","process":"web","follow":true}}`+"\n")
	writer.Close()

	if !<-released {
		t.Fatal("the handler outlived the channel that carried it")
	}

	if err := <-served; err != nil {
		t.Fatalf("serve: %v", err)
	}
}

func TestTheChannelContextEndsWhenAWriteFails(t *testing.T) {
	server := NewServer(Options{AgentVersion: testAgentVersion, License: license.Fixed(contract.LicenseDev), Now: fixedNow})

	released := make(chan bool, 1)
	server.Register("project.logs", func(ctx *Context, _ json.RawMessage) (any, error) {
		ctx.Emit("log", map[string]any{"line": "dropped on the floor"})

		select {
		case <-ctx.Channel().Done():
			released <- true
		case <-time.After(5 * time.Second):
			released <- false
		}

		return map[string]any{"lines": []string{}}, nil
	})

	reader, writer := io.Pipe()
	defer writer.Close()

	served := make(chan error, 1)
	go func() { served <- server.Serve(reader, &droppingWriter{keep: 1}) }()

	io.WriteString(writer, `{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":3}}`+"\n")
	io.WriteString(writer, `{"id":2,"cmd":"project.logs","params":{"name":"web","process":"web","follow":true}}`+"\n")

	if !<-released {
		t.Fatal("the handler outlived the channel that carried it")
	}

	if err := <-served; err == nil || !strings.Contains(err.Error(), "broken pipe") {
		t.Fatalf("serve returned %v, want the write failure", err)
	}
}
