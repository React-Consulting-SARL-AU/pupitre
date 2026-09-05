package entitlement

import (
	"encoding/json"
	"reflect"
	"testing"

	"pupitre.studio/agent/internal/contract"
)

func TestRestrictedCommandsMatchTheContract(t *testing.T) {
	raw, ok := contract.Definition("RestrictedCommands")
	if !ok {
		t.Fatal("schema.json has no RestrictedCommands definition")
	}

	var definition struct {
		Enum []string `json:"enum"`
	}
	if err := json.Unmarshal(raw, &definition); err != nil {
		t.Fatalf("decode RestrictedCommands: %v", err)
	}

	if len(definition.Enum) == 0 {
		t.Fatal("RestrictedCommands enum is empty")
	}

	if !reflect.DeepEqual(RestrictedCommands, definition.Enum) {
		t.Fatalf("RestrictedCommands = %v, schema says %v", RestrictedCommands, definition.Enum)
	}

	for _, cmd := range definition.Enum {
		if !AllowedInRestrictedMode(cmd) {
			t.Errorf("%s should be allowed in restricted mode", cmd)
		}
	}

	for _, cmd := range []string{"probe", "install", "project.up", "secrets.set"} {
		if AllowedInRestrictedMode(cmd) {
			t.Errorf("%s should be refused in restricted mode", cmd)
		}
	}
}

// A restricted server repairs itself by enrolling again: a lost token, a revoked one, or an entitlement to restore.
func TestRestrictedModeLetsAServerEnrolAgain(t *testing.T) {
	if !AllowedInRestrictedMode("enroll") {
		t.Error("un serveur restreint ne peut plus se ré-enrôler")
	}

	restricted := State{Entitlement: contract.EntitlementRestricted, Enrolled: true}
	if !restricted.Allows("enroll") {
		t.Error("le garde refuse enroll à un serveur enrôlé mais restreint")
	}
}

// An unenrolled binary opens nothing a restricted server does not also open.
func TestUnenrolledCommandsAreOpenInRestrictedMode(t *testing.T) {
	for _, cmd := range UnenrolledCommands {
		if !AllowedInRestrictedMode(cmd) {
			t.Errorf("%s ouvert sans jeton mais fermé en mode restreint", cmd)
		}
	}

	if !AllowedWithoutEnrolment("enroll") {
		t.Error("un binaire sans jeton ne peut pas s'enrôler")
	}

	if AllowedWithoutEnrolment("install") || AllowedWithoutEnrolment("snapshot") {
		t.Error("un binaire sans jeton ouvre plus que son enrôlement")
	}
}
