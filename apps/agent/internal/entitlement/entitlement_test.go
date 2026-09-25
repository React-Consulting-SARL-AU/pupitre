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

func TestUnenrolledCommandsMatchTheContract(t *testing.T) {
	raw, ok := contract.Definition("UnenrolledCommands")
	if !ok {
		t.Fatal("schema.json has no UnenrolledCommands definition")
	}

	var definition struct {
		Enum []string `json:"enum"`
	}
	if err := json.Unmarshal(raw, &definition); err != nil {
		t.Fatalf("decode UnenrolledCommands: %v", err)
	}

	if len(definition.Enum) == 0 || !reflect.DeepEqual(UnenrolledCommands, definition.Enum) {
		t.Fatalf("UnenrolledCommands = %v, schema says %v", UnenrolledCommands, definition.Enum)
	}
}

func TestRestrictedModeLetsAServerEnrolAgain(t *testing.T) {
	if !AllowedInRestrictedMode("enroll") {
		t.Error("a restricted server can no longer re-enrol")
	}

	restricted := State{Entitlement: contract.EntitlementRestricted, Enrolled: true}
	if !restricted.Allows("enroll") {
		t.Error("the guard refuses enroll to an enrolled but restricted server")
	}
}

func TestUnenrolledCommandsAreOpenInRestrictedMode(t *testing.T) {
	for _, cmd := range UnenrolledCommands {
		if !AllowedInRestrictedMode(cmd) {
			t.Errorf("%s open without a token but closed in restricted mode", cmd)
		}
	}

	if !AllowedWithoutEnrolment("enroll") {
		t.Error("a binary without a token cannot enrol")
	}

	if AllowedWithoutEnrolment("install") || AllowedWithoutEnrolment("snapshot") {
		t.Error("a binary without a token opens more than its enrolment")
	}
}
