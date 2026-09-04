package probe

import (
	"testing"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
)

func TestTranscripts(t *testing.T) {
	modtest.RunTranscripts(t, "testdata/*.jsonl", modtest.TranscriptOptions{
		Registry: modules.Default(),
		Register: func(server *protocol.Server, engine *modules.Engine) {
			RegisterCommands(server, Options{Sys: engine.Sys, Version: engine.AgentVersion})
		},
	})
}
