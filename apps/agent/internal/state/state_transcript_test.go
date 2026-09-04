package state_test

import (
	"testing"
	"time"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/ai/claude"
	"pupitre.studio/agent/internal/modules/ai/codex"
	"pupitre.studio/agent/internal/modules/ai/hermes"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/state"
)

// The real agent modules, so agent.open answers on the machine the transcript describes and refuses on the one it does not.
func agentRegistry() *modules.Registry {
	registry := modules.NewRegistry()
	registry.Register(claude.Module{})
	registry.Register(codex.Module{})
	registry.Register(hermes.Module{})

	return registry
}

func TestTranscripts(t *testing.T) {
	modtest.RunTranscripts(t, "testdata/*.jsonl", modtest.TranscriptOptions{
		Registry: agentRegistry(),
		Register: func(server *protocol.Server, engine *modules.Engine) {
			state.RegisterCommands(server, state.FromEngine(engine, state.Options{
				Follow: state.FollowOptions{Limit: -1, Sleep: func(time.Duration) {}},
				Self:   func() int { return 900 },
				Sleep:  func(time.Duration) {},
			}))
		},
	})
}
