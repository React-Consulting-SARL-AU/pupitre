package state_test

import (
	"testing"
	"time"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/ai/claude"
	"pupitre.studio/agent/internal/modules/ai/codex"
	"pupitre.studio/agent/internal/modules/ai/hermes"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/node"
	"pupitre.studio/agent/internal/modules/runtime/python"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/state"
)

// Real agent modules, plus demo modules with and without a unit, so driving and refusing a service both show.
func agentRegistry() *modules.Registry {
	registry := modules.NewRegistry()
	registry.Register(claude.Module{})
	registry.Register(codex.Module{})
	registry.Register(hermes.Module{})
	registry.Register(node.Module{})
	registry.Register(python.Module{})
	registry.Register(modtest.Passing{ID: "core.system"})
	registry.Register(modtest.Passing{ID: "tool.demo", Requires: []string{"core.system"}, Unit: "demo", Port: 8080})

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
