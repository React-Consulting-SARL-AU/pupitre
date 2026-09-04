package modules

import (
	"encoding/json"

	"pupitre.sh/agent/internal/contract"
	"pupitre.sh/agent/internal/protocol"
)

func RegisterCommands(server *protocol.Server, engine *Engine) {
	server.Register("catalog", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return engine.Catalog(), nil
	})

	server.Register("install", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		var params struct {
			Modules      []string                  `json:"modules"`
			Config       map[string]map[string]any `json:"config"`
			SecretsStdin bool                      `json:"secrets_stdin"`
		}
		if err := json.Unmarshal(raw, &params); err != nil {
			return nil, protocol.NewError(contract.ErrorBadRequest, "paramètres illisibles : "+err.Error())
		}

		secrets, err := decodeSecrets(ctx.Secrets, params.SecretsStdin)
		if err != nil {
			return nil, err
		}

		return engine.Install(Request{Modules: params.Modules, Config: params.Config, Secrets: secrets, Persist: true}, Emitter(ctx))
	})

	server.Register("uninstall", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		var params struct {
			Modules []string `json:"modules"`
		}
		if err := json.Unmarshal(raw, &params); err != nil {
			return nil, protocol.NewError(contract.ErrorBadRequest, "paramètres illisibles : "+err.Error())
		}

		return engine.Uninstall(params.Modules, Emitter(ctx))
	})

	server.Register("upgrade", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		var params struct {
			Modules []string `json:"modules"`
		}
		if err := json.Unmarshal(raw, &params); err != nil {
			return nil, protocol.NewError(contract.ErrorBadRequest, "paramètres illisibles : "+err.Error())
		}

		return engine.Upgrade(Request{Modules: params.Modules}, Emitter(ctx))
	})

	server.Register("report", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return engine.Report()
	})
}

// The install secret line is {"<module id>": {"<field key>": "<value>"}}, mirroring params.config.
func decodeSecrets(raw json.RawMessage, expected bool) (map[string]map[string]string, error) {
	if !expected || len(raw) == 0 {
		return map[string]map[string]string{}, nil
	}

	var secrets map[string]map[string]string
	if err := json.Unmarshal(raw, &secrets); err != nil {
		return nil, protocol.NewError(contract.ErrorBadRequest, "flux secret illisible : un objet {module: {clé: valeur}} est attendu").
			WithFix("Écris les secrets groupés par identifiant de module, comme config.")
	}

	return secrets, nil
}

func Emitter(ctx *protocol.Context) Sink {
	return func(event contract.StepEvent) {
		fields := map[string]any{"module": event.Module, "step": event.Step, "status": string(event.Status), "ms": event.Ms}
		if event.Replay != "" {
			fields["replay"] = event.Replay
		}

		ctx.Emit("step", fields)
	}
}
