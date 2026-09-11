package modules

import (
	"encoding/json"
	"pupitre.studio/agent/internal/i18n"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/protocol"
)

func RegisterCommands(server *protocol.Server, engine *Engine) {
	server.Register("catalog", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return engine.Catalog(), nil
	})

	server.Register("install", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		var params struct {
			Modules      []string                  `json:"modules"`
			Config       map[string]map[string]any `json:"config"`
			Defer        []string                  `json:"defer"`
			SecretsStdin bool                      `json:"secrets_stdin"`
		}
		if err := json.Unmarshal(raw, &params); err != nil {
			return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("command.params.unreadable", err.Error()))
		}

		secrets, err := decodeSecrets(ctx.Secrets, params.SecretsStdin)
		if err != nil {
			return nil, err
		}

		return engine.Install(Request{Modules: params.Modules, Config: params.Config, Defer: params.Defer, Secrets: secrets, Persist: true}, Emitter(ctx))
	})

	// No secret, no lock, nothing touched: it answers what an install would refuse.
	server.Register("install.check", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		var params struct {
			Modules []string                  `json:"modules"`
			Config  map[string]map[string]any `json:"config"`
			Defer   []string                  `json:"defer"`
		}
		if err := json.Unmarshal(raw, &params); err != nil {
			return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("command.params.unreadable", err.Error()))
		}

		return engine.Check(Request{Modules: params.Modules, Config: params.Config, Defer: params.Defer}, Emitter(ctx))
	})

	server.Register("uninstall", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		var params struct {
			Modules []string `json:"modules"`
		}
		if err := json.Unmarshal(raw, &params); err != nil {
			return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("command.params.unreadable", err.Error()))
		}

		return engine.Uninstall(params.Modules, Emitter(ctx))
	})

	server.Register("upgrade", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		var params struct {
			Modules []string `json:"modules"`
		}
		if err := json.Unmarshal(raw, &params); err != nil {
			return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("command.params.unreadable", err.Error()))
		}

		return engine.Upgrade(Request{Modules: params.Modules}, Emitter(ctx))
	})

	server.Register("module.config", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		var params struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(raw, &params); err != nil {
			return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("command.params.unreadable", err.Error()))
		}

		return engine.Config(params.ID)
	})

	server.Register("report", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return engine.Report()
	})
}

func decodeSecrets(raw json.RawMessage, expected bool) (map[string]map[string]string, error) {
	if !expected || len(raw) == 0 {
		return map[string]map[string]string{}, nil
	}

	value, err := contract.Decode(raw)
	if err == nil {
		err = contract.Validate("InstallSecrets", value)
	}
	if err != nil {
		return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("secrets.invalid", err.Error())).
			WithFix(i18n.T("secrets.install.fix"))
	}

	var secrets map[string]map[string]string
	if err := json.Unmarshal(raw, &secrets); err != nil {
		return nil, protocol.NewError(contract.ErrorInternal, i18n.T("secrets.unreadable", err.Error()))
	}

	return secrets, nil
}

func Emitter(ctx *protocol.Context) Sink {
	return func(event contract.StepEvent) {
		fields := map[string]any{"module": event.Module, "step": event.Step, "status": string(event.Status), "ms": event.Ms}
		if event.Replay != "" {
			fields["replay"] = event.Replay
		}
		if event.Message != "" {
			fields["message"] = event.Message
		}

		ctx.Emit("step", fields)
	}
}
