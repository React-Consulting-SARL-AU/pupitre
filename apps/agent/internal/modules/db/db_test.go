package db_test

import (
	"testing"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/db"
	"pupitre.studio/agent/internal/modules/db/mongodb"
	"pupitre.studio/agent/internal/modules/db/mysql"
	"pupitre.studio/agent/internal/modules/db/postgres"
	"pupitre.studio/agent/internal/modules/modtest"
)

func registry(t *testing.T) *modules.Registry {
	t.Helper()

	registry := modules.NewRegistry()
	registry.Register(modtest.Passing{ID: "core.system"})
	registry.Register(mysql.Module{})
	registry.Register(postgres.Module{})
	registry.Register(mongodb.Module{})

	return registry
}

func TestTranscripts(t *testing.T) {
	modtest.RunTranscripts(t, "testdata/*.jsonl", modtest.TranscriptOptions{Registry: registry(t), Register: db.RegisterCommands})
}
