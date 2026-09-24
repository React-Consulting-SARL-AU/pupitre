package backup_test

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/backup"
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/s3/s3test"
)

type line struct {
	ID     int             `json:"id"`
	OK     bool            `json:"ok"`
	Event  string          `json:"event"`
	Step   string          `json:"step"`
	Result json.RawMessage `json:"result"`
	Error  *protocol.Error `json:"error"`
}

func session(t *testing.T, b *bench, requests ...string) []line {
	t.Helper()

	server := protocol.NewServer(protocol.Options{AgentVersion: "0.8.0-test"})
	backup.RegisterCommands(server, b.service)

	hello := `{"id":1,"cmd":"hello","params":{"app_version":"0.8.0","protocol":` + jsonNumber(contract.ProtocolVersion) + `}}`

	var out bytes.Buffer
	if err := server.Serve(strings.NewReader(hello+"\n"+strings.Join(requests, "\n")+"\n"), &out); err != nil {
		t.Fatal(err)
	}

	var lines []line
	for _, raw := range strings.Split(strings.TrimSpace(out.String()), "\n") {
		var parsed line
		if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
			t.Fatalf("%s: %v", raw, err)
		}

		lines = append(lines, parsed)
	}

	return lines
}

func jsonNumber(value int) string {
	encoded, _ := json.Marshal(value)

	return string(encoded)
}

func answer(lines []line, id int) line {
	for _, candidate := range lines {
		if candidate.ID == id && candidate.Event == "" {
			return candidate
		}
	}

	return line{}
}

func TestTheCommandsReadTheirSecretsOnTheLineAfterTheRequest(t *testing.T) {
	bucket, source, made := backedUp(t)
	location, _ := json.Marshal(source.location())
	secrets, _ := json.Marshal(source.secrets())

	lines := session(t, newBench(t, bucket),
		`{"id":2,"cmd":"backup.inspect","params":{"location":`+string(location)+`,"secrets_stdin":true}}`,
		string(secrets),
		`{"id":3,"cmd":"backup.inspect","params":{"location":`+string(location)+`,"secrets_stdin":true}}`,
		`{"access_key_id":"only half"}`,
		`{"id":4,"cmd":"backup.status","params":{}}`,
		`{"id":5,"cmd":"backup.restore.abort","params":{}}`,
	)

	inspected := answer(lines, 2)
	var manifest contract.BackupManifest
	if !inspected.OK || json.Unmarshal(inspected.Result, &manifest) != nil || manifest.ID != made.ID {
		t.Fatalf("inspect = %+v", inspected)
	}

	if refused := answer(lines, 3); refused.OK || refused.Error.Code != contract.ErrorBadRequest || refused.Error.Fix == "" {
		t.Fatalf("a secret line of another shape: %+v", refused)
	}

	if status := answer(lines, 4); !status.OK {
		t.Fatalf("status = %+v", status)
	}

	if aborted := answer(lines, 5); !aborted.OK || string(aborted.Result) != `{"done":true}` {
		t.Fatalf("abort = %+v", aborted)
	}
}

func TestABackupFromTheProtocolStreamsItsSteps(t *testing.T) {
	b := newBench(t, s3test.New(t, bucketName)).configured()

	lines := session(t, b, `{"id":2,"cmd":"backup.run","params":{"projects":"none"}}`)

	var steps []string
	for _, candidate := range lines {
		if candidate.Event == "step" && candidate.ID == 2 {
			steps = append(steps, candidate.Step)
		}
	}

	for _, want := range []string{"setup", "home", "db:postgres:*", "db:postgres:shop", "db:redis:*", "path:notes", "manifest", "declare", "prune"} {
		if !strings.Contains(strings.Join(steps, " "), want) {
			t.Fatalf("steps %v lack %s", steps, want)
		}
	}

	if strings.Contains(strings.Join(steps, " "), "project:") {
		t.Fatal("projects none carries no project")
	}

	var result contract.BackupRunResult
	if ran := answer(lines, 2); !ran.OK || json.Unmarshal(ran.Result, &result) != nil || !result.Declared {
		t.Fatalf("run = %+v", ran)
	}

	if err := contract.ValidateValue("BackupRunResult", result); err != nil {
		t.Fatal(err)
	}
}

func TestAManualBackupCarriesTheNameGivenToItToTheManifestAndThePlatform(t *testing.T) {
	b := newBench(t, s3test.New(t, bucketName)).configured()

	lines := session(t, b,
		`{"id":2,"cmd":"backup.run","params":{"name":"Avant la migration 🙂"}}`,
		`{"id":3,"cmd":"backup.run","params":{"name":" avant "}}`,
		`{"id":4,"cmd":"backup.run","params":{"name":"`+strings.Repeat("é", 81)+`"}}`,
	)

	if ran := answer(lines, 2); !ran.OK {
		t.Fatalf("run = %+v", ran)
	}

	declared := b.platform.declarations()
	if len(declared) != 1 || declared[0].Name != "Avant la migration 🙂" {
		t.Fatalf("declared = %+v", declared)
	}

	if err := contract.ValidateValue("BackupDeclaration", declared[0]); err != nil {
		t.Fatal(err)
	}

	for _, id := range []int{3, 4} {
		if refused := answer(lines, id); refused.OK || refused.Error.Code != contract.ErrorBadRequest {
			t.Fatalf("request %d: %+v", id, refused)
		}
	}
}

func TestAScheduledBackupHasNoName(t *testing.T) {
	b := newBench(t, s3test.New(t, bucketName)).configured()

	b.run(contract.BackupTriggerSchedule)

	encoded, _ := json.Marshal(b.platform.declarations()[0])
	if strings.Contains(string(encoded), `"name"`) {
		t.Fatalf("declaration = %s", encoded)
	}
}
