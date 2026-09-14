package contract

import (
	"encoding/json"
	"testing"
)

func enumOf(t *testing.T, definition string, path ...string) []string {
	t.Helper()

	var node map[string]json.RawMessage
	if err := json.Unmarshal(mustDefinition(t, definition), &node); err != nil {
		t.Fatalf("decode %s: %v", definition, err)
	}

	for _, key := range path {
		var next map[string]json.RawMessage
		if err := json.Unmarshal(node[key], &next); err != nil {
			t.Fatalf("decode %s/%s: %v", definition, key, err)
		}
		node = next
	}

	var values []string
	if err := json.Unmarshal(node["enum"], &values); err != nil {
		t.Fatalf("decode enum of %s: %v", definition, err)
	}

	return values
}

func mustDefinition(t *testing.T, name string) json.RawMessage {
	t.Helper()

	raw, ok := Definition(name)
	if !ok {
		t.Fatalf("definition %q missing from schema.json", name)
	}

	return raw
}

func assertSameSet(t *testing.T, label string, got, want []string) {
	t.Helper()

	wanted := map[string]bool{}
	for _, value := range want {
		wanted[value] = true
	}

	seen := map[string]bool{}
	for _, value := range got {
		if !wanted[value] {
			t.Errorf("%s: Go declares %q, schema.json does not", label, value)
		}
		seen[value] = true
	}

	for _, value := range want {
		if !seen[value] {
			t.Errorf("%s: schema.json declares %q, Go does not", label, value)
		}
	}
}

func TestErrorCodesMatchSchema(t *testing.T) {
	codes := make([]string, 0, len(ErrorCodes))
	for _, code := range ErrorCodes {
		codes = append(codes, string(code))
	}

	assertSameSet(t, "ErrorCode", codes, enumOf(t, "ErrorCode"))
}

func TestEntitlementsMatchSchema(t *testing.T) {
	values := make([]string, 0, len(Entitlements))
	for _, entitlement := range Entitlements {
		values = append(values, string(entitlement))
	}

	assertSameSet(t, "Entitlement", values, enumOf(t, "HelloResult", "properties", "entitlement"))
}

func TestProtocolVersionComesFromSchema(t *testing.T) {
	if ProtocolVersion != 2 {
		t.Fatalf("ProtocolVersion = %d, want 2", ProtocolVersion)
	}
}

func TestParamsDefinitionFollowsTheExportNaming(t *testing.T) {
	cases := map[string]string{
		"hello":                "HelloParams",
		"ping":                 "PingParams",
		"project.up":           "ProjectUpParams",
		"project.git_status":   "ProjectGitStatusParams",
		"project.working_tree": "ProjectWorkingTreeParams",
		"service.status":       "ServiceStatusParams",
		"agent.upgrade":        "AgentUpgradeParams",
	}

	for cmd, want := range cases {
		if got := ParamsDefinition(cmd); got != want {
			t.Errorf("ParamsDefinition(%q) = %q, want %q", cmd, got, want)
		}

		if _, ok := Definition(want); !ok {
			t.Errorf("schema.json has no definition %q", want)
		}
	}
}
