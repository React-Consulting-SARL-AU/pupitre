package modules_test

import (
	"testing"

	"pupitre.sh/agent/internal/modules/modtest"
)

func TestFixtures(t *testing.T) {
	registry := demoRegistry(
		modtest.Passing{ID: "core.system"},
		modtest.Failing{ID: "db.broken", Requires: []string{"core.system"}, FailAt: "install-package", Message: "E: Unable to locate package db-broken"},
		modtest.Passing{ID: "tool.demo", Requires: []string{"core.system"}, Unit: "demo", EnvKey: "DEMO_PASSWORD", Port: 8080},
		modtest.Passing{ID: "tool.rival", Conflicts: []string{"tool.demo"}},
	)

	modtest.RunTranscripts(t, "testdata/*.jsonl", modtest.TranscriptOptions{Registry: registry})
}
