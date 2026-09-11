package tool

import (
	"encoding/json"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/tool/onepassword"
	"pupitre.studio/agent/internal/protocol"
)

func RegisterCommands(server *protocol.Server, runner *modules.Engine) {
	server.Register("secrets.sync", command(runner, func(ctx *modules.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Project string `json:"project"`
		}](raw)
		if err != nil {
			return nil, err
		}

		return onepassword.Env(ctx, params.Project, true)
	}))

	server.Register("project.env", command(runner, func(ctx *modules.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Name  string `json:"name"`
			Force bool   `json:"force"`
		}](raw)
		if err != nil {
			return nil, err
		}

		return onepassword.Env(ctx, params.Name, params.Force)
	}))

}

func command(runner *modules.Engine, run func(*modules.Context, json.RawMessage) (any, error)) protocol.Handler {
	return func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		var result any

		err := runner.Command(onepassword.ID, modules.Emitter(ctx), func(mctx *modules.Context) error {
			value, err := run(mctx, raw)
			result = value

			return err
		})
		if err != nil {
			return nil, err
		}

		return result, nil
	}
}

func decode[T any](raw json.RawMessage) (T, error) {
	var params T
	if err := json.Unmarshal(raw, &params); err != nil {
		return params, protocol.NewError(contract.ErrorBadRequest, i18n.T("command.params.unreadable", err.Error()))
	}

	return params, nil
}
