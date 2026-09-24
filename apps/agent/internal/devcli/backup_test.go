package devcli_test

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/protocol"
)

// The terminal reaches the handlers the app calls: here, two that answer as the backups would.
func backups(t *testing.T) func(...string) run {
	t.Helper()

	server := protocol.NewServer(protocol.Options{AgentVersion: "0.0.0-test", Entitlement: entitlement.Fixed(contract.EntitlementDev)})

	server.Register("backup.status", func(*protocol.Context, json.RawMessage) (any, error) {
		return contract.BackupStatusResult{Configured: true, IntervalHours: 24, Keep: 14, NextRunAt: "2026-09-25T03:00:00Z", Last: &contract.BackupLastRun{At: "2026-09-24T03:00:00Z", OK: true, ID: "20260924T030000Z-abcdef", Bytes: 3 << 20}}, nil
	})

	server.Register("backup.run", func(ctx *protocol.Context, _ json.RawMessage) (any, error) {
		ctx.Emit("step", map[string]any{"module": "core.backup", "step": "setup", "status": "ok", "ms": 10})
		ctx.Emit("step", map[string]any{"module": "core.backup", "step": "project:web", "status": "skip", "ms": 10})
		ctx.Emit("step", map[string]any{"module": "core.backup", "step": "db:postgres:shop", "status": "fail", "ms": 10, "message": "pg_dump: exit 1"})

		return contract.BackupRunResult{ID: "20260924T031500Z-123456", Parts: []contract.BackupPart{{Key: "setup.pupitre"}}, Warnings: []string{"db:postgres:shop: pg_dump: exit 1"}, Declared: true}, nil
	})

	return func(args ...string) run {
		var stdout, stderr bytes.Buffer
		code := devcli.Run(devcli.Options{Server: server}, args, &stdout, &stderr)

		return run{code: code, stdout: stdout.String(), stderr: stderr.String()}
	}
}

func TestDevBackupRunsAndSaysWhereBackupsStand(t *testing.T) {
	dev := backups(t)

	made := dev("backup", "now")
	if made.code != 0 || !strings.Contains(made.stdout, "✓ setup") || !strings.Contains(made.stdout, "· project:web") || !strings.Contains(made.stdout, "✗ db:postgres:shop") || !strings.Contains(made.stdout, "20260924T031500Z-123456") {
		t.Fatalf("backup now = %+v", made)
	}

	status := dev("backup", "status")
	if status.code != 0 || !strings.Contains(status.stdout, "24") || !strings.Contains(status.stdout, "20260924T030000Z-abcdef") || !strings.Contains(status.stdout, "3.0") {
		t.Fatalf("backup status = %+v", status)
	}

	if raw := dev("backup", "status", "--json"); raw.code != 0 || !strings.Contains(raw.stdout, `"interval_hours": 24`) {
		t.Fatalf("--json = %+v", raw)
	}

	if wrong := dev("backup", "later"); wrong.code != 2 {
		t.Fatalf("an unknown word = %+v", wrong)
	}
}
