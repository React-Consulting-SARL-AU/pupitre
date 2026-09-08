package selfupdate

import (
	"encoding/json"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
)

func RegisterCommands(server *protocol.Server, options Options) {
	server.Register("agent.upgrade", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		var params struct {
			Version        string `json:"version"`
			Signature      string `json:"signature"`
			AllowDowngrade bool   `json:"allow_downgrade"`
		}
		if err := json.Unmarshal(raw, &params); err != nil {
			return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("selfupdate.params.unreadable", err.Error()))
		}

		return New(options).Upgrade(Request{
			Version:        params.Version,
			Signature:      params.Signature,
			AllowDowngrade: params.AllowDowngrade,
		})
	})
}
