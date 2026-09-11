package contract

import (
	"encoding/json"
	"os"
	"testing"
)

type document struct {
	Schema   string                     `json:"$schema"`
	Protocol int                        `json:"protocol"`
	Defs     map[string]json.RawMessage `json:"$defs"`
}

func TestSchemaDeclaresTheContract(t *testing.T) {
	raw, err := os.ReadFile("schema.json")
	if err != nil {
		t.Fatalf("read schema.json: %v", err)
	}

	var doc document
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("decode schema.json: %v", err)
	}

	if doc.Schema != "https://json-schema.org/draft/2020-12/schema" {
		t.Fatalf("unexpected $schema %q", doc.Schema)
	}

	if doc.Protocol != 1 {
		t.Fatalf("unexpected protocol %d", doc.Protocol)
	}

	for _, name := range []string{
		"Request", "Event", "LogEvent", "StepEvent", "Response", "ProtocolError", "ErrorCode", "RestrictedCommands",
		"HelloParams", "HelloResult", "PingResult", "ProbeResult", "CatalogResult",
		"InstallParams", "InstallSecrets", "InstallResult", "SnapshotResult", "StatusResult",
		"ProjectUpParams", "ProjectAddParams", "AgentOpenParams", "ServiceSecretParams",
		"DbDumpParams", "AgentUpgradeParams", "DoctorResult", "DiagResult",
		"FileEvent", "FsListParams", "FsListResult", "FsStatParams", "FsStatResult",
		"FsReadParams", "FsReadResult", "FsWriteParams", "FsWriteResult",
		"FsMkdirParams", "FsMkdirResult", "FsRenameParams", "FsRenameResult",
		"FsRemoveParams", "FsRemoveResult",
		"Manifest", "Field", "Preset", "Presets",
	} {
		if _, ok := doc.Defs[name]; !ok {
			t.Errorf("missing definition %q", name)
		}
	}
}

func TestErrorCodesAreStable(t *testing.T) {
	raw, err := os.ReadFile("schema.json")
	if err != nil {
		t.Fatalf("read schema.json: %v", err)
	}

	var doc document
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("decode schema.json: %v", err)
	}

	var errorCode struct {
		Enum []string `json:"enum"`
	}
	if err := json.Unmarshal(doc.Defs["ErrorCode"], &errorCode); err != nil {
		t.Fatalf("decode ErrorCode: %v", err)
	}

	present := map[string]bool{}
	for _, code := range errorCode.Enum {
		present[code] = true
	}

	for _, code := range []string{
		"hello_required", "protocol_mismatch", "bad_request", "unknown_command",
		"entitlement_required", "project_not_found", "no_report", "bad_signature",
	} {
		if !present[code] {
			t.Errorf("missing error code %q", code)
		}
	}
}
