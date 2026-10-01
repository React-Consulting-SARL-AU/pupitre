package modtest

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/golden"
	"pupitre.studio/agent/internal/license"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/protocol"
)

const Secret = "s3cret-de-test"

type TranscriptOptions struct {
	Registry *modules.Registry
	Register func(*protocol.Server, *modules.Engine)
}

type transcript struct {
	path       string
	license    contract.License
	unenrolled bool
	prepare    []func(*FakeSys)
	input      []string
	expected   []string
	commands   map[int64]string
}

// Lines: "> request", "$ secret line", "< expected output", "@directive"; UPDATE_GOLDEN=1 records a diverging run.
func RunTranscripts(t *testing.T, glob string, options TranscriptOptions) {
	t.Helper()

	paths, err := filepath.Glob(glob)
	if err != nil || len(paths) == 0 {
		t.Fatalf("no transcript matches %s: %v", glob, err)
	}

	for _, path := range paths {
		t.Run(filepath.Base(path), func(t *testing.T) {
			runTranscript(t, parseTranscript(t, path), options)
		})
	}
}

func parseTranscript(t *testing.T, path string) transcript {
	t.Helper()

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	parsed := transcript{path: path, license: contract.LicenseDev, commands: map[int64]string{}}

	for _, line := range strings.Split(string(raw), "\n") {
		switch {
		case line == "" || strings.HasPrefix(line, "#"):
		case strings.HasPrefix(line, "@"):
			parsed.directive(t, path, line)
		case strings.HasPrefix(line, "> "):
			request := strings.TrimPrefix(line, "> ")
			parsed.input = append(parsed.input, request)
			parsed.remember(t, request)
		case strings.HasPrefix(line, "$ "):
			parsed.input = append(parsed.input, strings.TrimPrefix(line, "$ "))
		case strings.HasPrefix(line, "< "):
			parsed.expected = append(parsed.expected, strings.TrimPrefix(line, "< "))
		default:
			t.Fatalf("%s: unexpected line %q", path, line)
		}
	}

	return parsed
}

func (f *transcript) directive(t *testing.T, path, line string) {
	t.Helper()

	name, rest, _ := strings.Cut(strings.TrimPrefix(line, "@"), " ")
	fields := strings.Fields(rest)

	switch name {
	case "license":
		f.license = contract.License(rest)
	case "unenrolled":
		f.unenrolled = true
	case "upgrade":
		f.prepare = append(f.prepare, func(fake *FakeSys) { fake.Upgrades[fields[0]] = fields[1] })
	case "package":
		f.prepare = append(f.prepare, func(fake *FakeSys) { fake.Packages[fields[0]] = fields[1] })
	case "unit":
		f.prepare = append(f.prepare, func(fake *FakeSys) { fake.Units[fields[0]] = UnitState(fields[1]) })
	case "user":
		f.prepare = append(f.prepare, func(fake *FakeSys) { fake.Users[fields[0]] = "/home/" + fields[0] })
	case "tool":
		f.prepare = append(f.prepare, func(fake *FakeSys) { fake.Tools[fields[0]] = fields[1] })
	case "version":
		f.prepare = append(f.prepare, func(fake *FakeSys) { fake.addVersion(fields[0], fields[1]) })
	case "file":
		filePath, content, _ := strings.Cut(rest, " ")
		f.prepare = append(f.prepare, func(fake *FakeSys) { fake.Files[filePath] = []byte(unescape(content) + "\n") })
	case "line":
		filePath, content, _ := strings.Cut(rest, " ")
		f.prepare = append(f.prepare, func(fake *FakeSys) {
			fake.Files[filePath] = append(fake.Files[filePath], []byte(unescape(content)+"\n")...)
		})
	case "serves":
		f.prepare = append(f.prepare, func(fake *FakeSys) { fake.Serves(fields[0], atoi(fields[1])) })
	case "listen":
		f.prepare = append(f.prepare, func(fake *FakeSys) { fake.Listen[atoi(fields[0])] = true })
	case "reply":
		program, reply, _ := strings.Cut(rest, " ")
		f.prepare = append(f.prepare, func(fake *FakeSys) { fake.Replies[program] = unescape(reply) + "\n" })
	case "answer":
		// " :: " separates a fragment holding spaces, which is how two git subcommands are told apart.
		fragment, answer := cutAnswer(rest)
		f.prepare = append(f.prepare, func(fake *FakeSys) { fake.Answer(fragment, unescape(answer)+"\n") })
	case "archive":
		archive, entries, _ := strings.Cut(rest, " ")
		f.prepare = append(f.prepare, func(fake *FakeSys) { fake.Archives[archive] = strings.Fields(entries) })
	case "dir":
		f.prepare = append(f.prepare, func(fake *FakeSys) { fake.Dirs[rest] = true })
	case "process":
		f.prepare = append(f.prepare, func(fake *FakeSys) { fake.Spawn(parseProc(fields, rest)) })
	case "shot":
		f.prepare = append(f.prepare, func(fake *FakeSys) {
			fake.Files[fields[2]] = make([]byte, atoi(fields[1]))
			fake.Times[fields[2]] = time.Unix(int64(atoi(fields[0])), 0)
		})
	case "fail":
		program, stderr, _ := strings.Cut(rest, " ")
		f.prepare = append(f.prepare, func(fake *FakeSys) { fake.FailProgram(program, stderr) })
	case "failline":
		fragment, stderr := cutAnswer(rest)
		f.prepare = append(f.prepare, func(fake *FakeSys) { fake.FailLine(fragment, stderr) })
	default:
		t.Fatalf("%s: unknown directive %q", path, line)
	}
}

func (f *transcript) remember(t *testing.T, request string) {
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

func runTranscript(t *testing.T, f transcript, options TranscriptOptions) {
	t.Helper()

	fixed := func() time.Time { return Epoch }
	fake := NewFakeSys()

	for _, prepare := range f.prepare {
		prepare(fake)
	}

	dir := t.TempDir()
	engine := &modules.Engine{
		Registry:     options.Registry,
		Sys:          fake,
		Now:          fixed,
		License:      func() contract.License { return f.license },
		AgentVersion: "0.0.0-test",
		ReportPath:   filepath.Join(dir, "report.json"),
		LogPath:      filepath.Join(dir, "pupitre.log"),
		InstallPath:  "/etc/pupitre/install.json",
	}

	granted := license.State{License: f.license, Enrolled: !f.unenrolled}
	server := protocol.NewServer(protocol.Options{AgentVersion: "0.0.0-test", License: func() license.State { return granted }, Now: fixed})
	modules.RegisterCommands(server, engine)

	if options.Register != nil {
		options.Register(server, engine)
	}

	var out bytes.Buffer
	if err := server.Serve(strings.NewReader(strings.Join(f.input, "\n")+"\n"), &out); err != nil {
		t.Fatalf("serve: %v", err)
	}

	got := strings.Split(strings.TrimRight(out.String(), "\n"), "\n")
	for _, line := range got {
		assertContractLine(t, line, f.commands)
	}

	produced := make([]string, len(got))
	for i, line := range got {
		produced[i] = strings.ReplaceAll(line, engine.ReportPath, "%REPORT_PATH%")
	}

	if recorded, diverged := recording(t, produced, f.expected); diverged {
		if golden.Updating() {
			if err := golden.Rewrite(f.path, recorded); err != nil {
				t.Fatal(err)
			}

			t.Logf("rewritten from the run: %s", f.path)
		} else {
			report(t, recorded, f.expected)
		}
	}

	assertNoSecret(t, "protocol output", out.Bytes())

	for _, path := range []string{engine.ReportPath, engine.LogPath} {
		if raw, err := os.ReadFile(path); err == nil {
			assertNoSecret(t, path, raw)
		}
	}

	if t.Failed() {
		t.Logf("mutations:\n  %s", strings.Join(fake.Mutations, "\n  "))
	}
}

// A line equal as JSON keeps the file's spelling, so a regeneration records only what changed.
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

func report(t *testing.T, got, want []string) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("got %d lines, want %d\n--- got\n%s\n--- want\n%s", len(got), len(want), strings.Join(got, "\n"), strings.Join(want, "\n"))
	}

	for i := range got {
		if !reflect.DeepEqual(decodeJSON(t, got[i]), decodeJSON(t, want[i])) {
			t.Errorf("line %d\n got: %s\nwant: %s", i+1, got[i], want[i])
		}
	}
}

func assertContractLine(t *testing.T, line string, commands map[int64]string) {
	t.Helper()

	if err := contractViolation(line, commands); err != nil {
		t.Error(err)
	}
}

// A command or event the contract does not define is a violation too.
func contractViolation(line string, commands map[int64]string) error {
	value, err := contract.Decode([]byte(line))
	if err != nil {
		return fmt.Errorf("output %q is not JSON: %w", line, err)
	}

	object, ok := value.(map[string]any)
	if !ok {
		return fmt.Errorf("output %q is not an object", line)
	}

	if _, isEvent := object["event"]; isEvent {
		return eventViolation(line, object)
	}

	if err := contract.Validate("Response", object); err != nil {
		return fmt.Errorf("output %q violates Response: %w", line, err)
	}

	if object["ok"] != true {
		return nil
	}

	id, _ := object["id"].(json.Number).Int64()
	command, sent := commands[id]
	if !sent {
		return fmt.Errorf("output %q answers an id no request of the transcript carries", line)
	}

	definition := contract.ResultDefinition(command)
	if err := contract.Validate(definition, object["result"]); err != nil {
		return fmt.Errorf("result of %s violates %s: %w\n%s", command, definition, err, line)
	}

	return nil
}

func eventViolation(line string, object map[string]any) error {
	if err := contract.Validate("Event", object); err != nil {
		return fmt.Errorf("output %q violates Event: %w", line, err)
	}

	definition := eventDefinition(object["event"].(string))
	if err := contract.Validate(definition, object); err != nil {
		return fmt.Errorf("output %q violates %s: %w", line, definition, err)
	}

	return nil
}

func eventDefinition(event string) string {
	return strings.ToUpper(event[:1]) + event[1:] + "Event"
}

func assertNoSecret(t *testing.T, label string, raw []byte) {
	t.Helper()

	if bytes.Contains(raw, []byte(Secret)) {
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

func atoi(value string) int {
	parsed, _ := strconv.Atoi(value)

	return parsed
}

func cutAnswer(rest string) (fragment, answer string) {
	if before, after, found := strings.Cut(rest, " :: "); found {
		return before, after
	}

	fragment, answer, _ = strings.Cut(rest, " ")

	return fragment, answer
}

// pid ppid user cpu rss etimes, then the command line.
func parseProc(fields []string, rest string) Proc {
	cpu, _ := strconv.ParseFloat(fields[3], 64)
	args := rest

	for i := 0; i < 6; i++ {
		_, args, _ = strings.Cut(strings.TrimLeft(args, " "), " ")
	}

	return Proc{
		PID: atoi(fields[0]), PPID: atoi(fields[1]), User: fields[2],
		CPU: cpu, RSS: atoi(fields[4]), Etimes: atoi(fields[5]), Args: args,
	}
}

// One line per directive, so multi-line content arrives escaped.
func unescape(value string) string {
	return strings.NewReplacer(`\n`, "\n", `\t`, "\t").Replace(value)
}
