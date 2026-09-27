package contract

import (
	"encoding/json"
	"testing"
)

func TestWhatASessionWithoutThePasswordAnswersComesFromTheContract(t *testing.T) {
	for _, cmd := range []string{"hello", "snapshot", "project.up", "fs.write", "service.restart", "agent.upgrade", "agent.migrate"} {
		if RequiresPrivilege(cmd, map[string]any{}) {
			t.Fatalf("%s must answer on the session sudo opens without a password", cmd)
		}
	}

	for _, cmd := range []string{"install", "install.check", "upgrade", "uninstall", "harden", "harden.sudo", "service.secret", "db.dump", "db.import", "backup.run", "backup.restore.setup", "enroll", "keys.trust", "reboot"} {
		if !RequiresPrivilege(cmd, map[string]any{}) {
			t.Fatalf("%s must wait for the privileged session", cmd)
		}
	}
}

func TestACommandTheListDoesNotNameIsPrivileged(t *testing.T) {
	if !RequiresPrivilege("db.drop", nil) {
		t.Fatal("a command outside the list must be held privileged")
	}
}

func TestOpeningAProjectToTheWebWaitsForThePrivilegedSession(t *testing.T) {
	cases := []struct {
		cmd        string
		params     string
		privileged bool
	}{
		{"project.add", `{"name":"shop"}`, false},
		{"project.add", `{"name":"shop","protected":false}`, true},
		{"project.add", `{"name":"shop","processes":[{"id":"hooks","protected":false}]}`, true},
		{"project.update", `{"name":"shop","patch":{"protected":true,"processes":[{"id":"web"}]}}`, false},
		{"project.update", `{"name":"shop","patch":{"protected":false}}`, true},
		{"project.update", `{"name":"shop","patch":{"processes":[{"id":"web","protected":false}]}}`, true},
	}

	for _, c := range cases {
		var decoded any
		if err := json.Unmarshal([]byte(c.params), &decoded); err != nil {
			t.Fatal(err)
		}

		if got := RequiresPrivilege(c.cmd, decoded); got != c.privileged {
			t.Fatalf("%s %s: privileged %v, want %v", c.cmd, c.params, got, c.privileged)
		}
	}

	for _, cmd := range []string{"access.list", "access.create", "access.update", "access.revoke"} {
		if !RequiresPrivilege(cmd, map[string]any{}) {
			t.Fatalf("%s must wait for the privileged session", cmd)
		}
	}
}

func TestADowngradeWaitsForThePrivilegedSession(t *testing.T) {
	var decoded any
	if err := json.Unmarshal([]byte(`{"version":"1.0.0","allow_downgrade":true}`), &decoded); err != nil {
		t.Fatal(err)
	}

	if !RequiresPrivilege("agent.upgrade", decoded) {
		t.Fatal("allow_downgrade lifts the floor: it must wait for the password")
	}

	if RequiresPrivilege("agent.upgrade", map[string]any{"allow_downgrade": false}) {
		t.Fatal("an upgrade above the floor needs no password")
	}
}
