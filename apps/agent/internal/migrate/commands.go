package migrate

import (
	"encoding/json"

	"pupitre.studio/agent/internal/protocol"
)

// agent.migrate always answers, even when a migration refused: what refused,
// which files were kept and what is still owed are exactly what the reader
// needs, and an error envelope would carry none of it. The refusal belongs to
// every other command, for as long as the configuration is not this binary's
// shape.
//
// It takes the runner the process already holds rather than building one: that
// runner is the one that remembers a refusal, and a second one would answer
// that the machine is merely behind.
func RegisterCommands(server *protocol.Server, runner *Runner) {
	server.Register("agent.migrate", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return runner.Run()
	})
}
