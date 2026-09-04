package state_test

import (
	"testing"
	"time"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/state"
)

func TestTranscripts(t *testing.T) {
	modtest.RunTranscripts(t, "testdata/*.jsonl", modtest.TranscriptOptions{
		Registry: modules.NewRegistry(),
		Register: func(server *protocol.Server, engine *modules.Engine) {
			state.RegisterCommands(server, state.FromEngine(engine, state.Options{
				Follow: state.FollowOptions{Limit: -1, Sleep: func(time.Duration) {}},
				Self:   func() int { return 900 },
				Sleep:  func(time.Duration) {},
			}))
		},
	})
}
