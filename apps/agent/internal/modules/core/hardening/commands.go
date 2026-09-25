package hardening

import (
	"encoding/json"
	"pupitre.studio/agent/internal/i18n"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/protocol"
)

func RegisterCommands(server *protocol.Server, engine *modules.Engine) {
	// The contract holds user to dev, the one account the fragment's AllowUsers names.
	server.Register("harden", func(ctx *protocol.Context, _ json.RawMessage) (any, error) {
		var result Result
		err := engine.Command(ID, modules.Emitter(ctx), func(mctx *modules.Context) error {
			result = Harden(mctx)
			return nil
		})
		if err != nil {
			return nil, err
		}

		return result, nil
	})

	server.Register("harden.sudo", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		var params struct {
			User string `json:"user"`
		}
		if err := json.Unmarshal(raw, &params); err != nil {
			return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("command.params.unreadable", err.Error()))
		}

		hash, refusal := sudoPasswordHash(ctx.Secrets)
		if refusal != nil {
			return nil, refusal
		}

		var result SudoResult
		err := engine.Command(ID, modules.Emitter(ctx), func(mctx *modules.Context) error {
			var err error
			result, err = SetSudoPassword(mctx, params.User, hash)

			return err
		})
		if err != nil {
			return nil, err
		}

		return result, nil
	})
}
