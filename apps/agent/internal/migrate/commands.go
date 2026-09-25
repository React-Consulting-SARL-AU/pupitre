package migrate

import (
	"encoding/json"

	"pupitre.studio/agent/internal/protocol"
)

// Takes the process's runner: only it remembers a refusal, a fresh one would report the machine merely pending.
func RegisterCommands(server *protocol.Server, runner *Runner) {
	server.Register("agent.migrate", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return runner.Run()
	})
}
