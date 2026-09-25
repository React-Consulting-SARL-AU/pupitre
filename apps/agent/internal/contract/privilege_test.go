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
