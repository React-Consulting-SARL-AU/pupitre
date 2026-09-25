package contract

import (
	"encoding/json"
	"os"
	"regexp"
	"testing"
)

func approvalFixtures(t *testing.T) map[string]KeyApproval {
	t.Helper()

	raw, err := os.ReadFile("key-approval.fixtures.json")
	if err != nil {
		t.Fatal(err)
	}

	var fixtures struct {
		Approvals map[string]KeyApproval `json:"approvals"`
	}
	if err := json.Unmarshal(raw, &fixtures); err != nil {
		t.Fatal(err)
	}

	return fixtures.Approvals
}

func TestTheKeyApprovalRulesComeFromTheSchema(t *testing.T) {
	rules := KeyApprovalRules

	if rules.MaxAgeSeconds != 7*86_400 || rules.FutureSkewSeconds != 300 {
		t.Fatalf("window = %+v", rules)
	}

	if len(rules.Hashes) != 2 || rules.Hashes[0] != "sha512" || rules.Hashes[1] != "sha256" {
		t.Fatalf("hashes = %v", rules.Hashes)
	}

	if len(rules.KeyTypes) != 4 || rules.KeyTypes[0] != "ssh-ed25519" {
		t.Fatalf("key types = %v", rules.KeyTypes)
	}

	for _, pattern := range []string{rules.KeyPattern, rules.FingerprintPattern, rules.ServerIDPattern} {
		if _, err := regexp.Compile(pattern); err != nil || pattern == "" {
			t.Fatalf("pattern %q: %v", pattern, err)
		}
	}

	server := regexp.MustCompile(rules.ServerIDPattern)
	for id, want := range map[string]bool{
		"cm0k2x9q80000a1b2c3d4e5f6":            true,
		"0f8fad5b-d9cb-469f-a165-70867728950e": true,
		"srv_42":                               false,
		"../etc":                               false,
		"CM0K2X9Q80000A1B2C3D4E5F6":            false,
	} {
		if server.MatchString(id) != want {
			t.Errorf("server id %q: match = %v", id, !want)
		}
	}
}

func TestTheKeyShapesValidateAgainstTheSchema(t *testing.T) {
	approvals := approvalFixtures(t)
	approval := approvals["ed25519"]

	cases := map[string]any{
		"KeyApproval":   approval,
		"AgentStateKey": AgentStateKey{PublicKey: approval.PublicKey, UserID: approval.UserID, DeviceID: "dev_1", Approvals: []KeyApproval{approval, approvals["ecdsa"]}},
		"KeysBeat":      KeysBeat{Signers: []string{approval.Signer}, Pending: []string{}},
	}

	for definition, value := range cases {
		if err := ValidateValue(definition, value); err != nil {
			t.Errorf("%s: %v", definition, err)
		}
	}

	extra := approval
	extra.ServerID = "srv_42"
	if ValidateValue("KeyApproval", extra) == nil {
		t.Fatal("a server id outside the pattern validates")
	}
}
