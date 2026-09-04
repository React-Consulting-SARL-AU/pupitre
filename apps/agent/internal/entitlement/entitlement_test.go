package entitlement

import (
	"reflect"
	"testing"
)

func TestRestrictedCommandsMatchTheContract(t *testing.T) {
	want := []string{"hello", "ping", "snapshot", "status", "diag", "agent.upgrade"}

	if !reflect.DeepEqual(RestrictedCommands, want) {
		t.Fatalf("RestrictedCommands = %v, want %v", RestrictedCommands, want)
	}

	for _, cmd := range want {
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
