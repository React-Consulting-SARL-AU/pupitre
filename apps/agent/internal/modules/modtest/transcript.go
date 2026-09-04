package modtest

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/protocol"
)

const Secret = "s3cret-de-test"

var resultDefinitions = map[string]string{
	"probe":     "ProbeResult",
	"catalog":   "CatalogResult",
	"install":   "InstallResult",
	"uninstall": "UninstallResult",
	"upgrade":   "UpgradeResult",
	"harden":    "HardenResult",
	"report":    "ReportResult",
	"hello":     "HelloResult",
	"ping":      "PingResult",

	"snapshot":        "SnapshotResult",
	"status":          "StatusResult",
	"service.status":  "ServiceStatusResult",
	"service.secret":  "ServiceSecretResult",
	"completions":     "CompletionsResult",
	"project.list":    "ProjectListResult",
	"project.add":     "ProjectAddResult",
	"project.detect":  "ProjectDetectResult",
	"project.remove":  "ProjectRemoveResult",
	"project.up":      "ProjectUpResult",
	"project.down":    "ProjectDownResult",
	"project.restart": "ProjectRestartResult",
	"project.logs":    "ProjectLogsResult",
	"project.install": "ProjectInstallResult",
	"project.url":     "ProjectUrlResult",

	"project.sync":         "ProjectSyncResult",
	"project.branches":     "ProjectBranchesResult",
	"project.checkout":     "ProjectCheckoutResult",
	"project.git_status":   "ProjectGitStatusResult",
	"project.working_tree": "ProjectWorkingTreeResult",
	"project.diff":         "ProjectDiffResult",
	"agent.open":           "AgentOpenResult",
	"sessions.list":        "SessionsListResult",
	"sessions.clean":       "SessionsCleanResult",
	"processes.list":       "ProcessesListResult",
	"process.kill":         "ProcessKillResult",
	"shots.list":           "ShotsListResult",
	"shots.url":            "ShotsUrlResult",
	"shots.clean":          "ShotsCleanResult",
	"reboot":               "RebootResult",
	"doctor":               "DoctorResult",
	"diag":                 "DiagResult",
}

type TranscriptOptions struct {
	Registry *modules.Registry
	Register func(*protocol.Server, *modules.Engine)
}

type transcript struct {
	entitlement contract.Entitlement
	unenrolled  bool
	prepare     []func(*FakeSys)
	input       []string
	expected    []string
	commands    map[int64]string
}

// A transcript is a .jsonl of "> request", "$ secret line on the same standard input", "< expected output" and "@directive" lines that seed the fake machine.
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

	parsed := transcript{entitlement: contract.EntitlementDev, commands: map[int64]string{}}

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
	case "entitlement":
		f.entitlement = contract.Entitlement(rest)
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
		// " :: " when the fragment itself holds spaces, which is how one tells two git subcommands apart.
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
		Entitlement:  func() contract.Entitlement { return f.entitlement },
		AgentVersion: "0.0.0-test",
		ReportPath:   filepath.Join(dir, "report.json"),
		LogPath:      filepath.Join(dir, "pupitre.log"),
		InstallPath:  "/etc/pupitre/install.json",
	}

	granted := entitlement.State{Entitlement: f.entitlement, Enrolled: !f.unenrolled}
	server := protocol.NewServer(protocol.Options{AgentVersion: "0.0.0-test", Entitlement: func() entitlement.State { return granted }, Now: fixed})
	modules.RegisterCommands(server, engine)
	if options.Register != nil {
		options.Register(server, engine)
	}

	var out bytes.Buffer
	if err := server.Serve(strings.NewReader(strings.Join(f.input, "\n")+"\n"), &out); err != nil {
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

	if t.Failed() {
		t.Logf("mutations:\n  %s", strings.Join(fake.Mutations, "\n  "))
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

// A transcript is one line per directive, so a multi-line file or command output arrives escaped.
func unescape(value string) string {
	return strings.NewReplacer(`\n`, "\n", `\t`, "\t").Replace(value)
}
