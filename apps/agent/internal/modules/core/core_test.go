package core_test

import (
	"testing"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/core"
	"pupitre.studio/agent/internal/modules/modtest"
)

func TestTranscripts(t *testing.T) {
	modtest.RunTranscripts(t, "testdata/*.jsonl", modtest.TranscriptOptions{Registry: modules.Default(), Register: core.RegisterCommands})
}
