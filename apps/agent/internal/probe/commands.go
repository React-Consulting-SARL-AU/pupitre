package probe

import (
	"encoding/json"

	"pupitre.studio/agent/internal/protocol"
)

func RegisterCommands(server *protocol.Server, options Options) {
	server.Register("probe", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return Run(options), nil
	})
}
