package hardening

import (
	"encoding/json"

	"pupitre.sh/agent/internal/contract"
	"pupitre.sh/agent/internal/modules"
	"pupitre.sh/agent/internal/protocol"
)

func RegisterCommands(server *protocol.Server, engine *modules.Engine) {
	server.Register("harden", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		var params struct {
			User string `json:"user"`
		}
		if err := json.Unmarshal(raw, &params); err != nil {
			return nil, protocol.NewError(contract.ErrorBadRequest, "paramètres illisibles : "+err.Error())
		}

		var result Result
		err := engine.Command(ID, modules.Emitter(ctx), func(mctx *modules.Context) error {
			result = Harden(mctx, params.User)
			return nil
		})
		if err != nil {
			return nil, err
		}

		return result, nil
	})
}
