package tool

import (
	"encoding/json"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/tool/onepassword"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys/env"
)

type secretsResult struct {
	Secrets []secret `json:"secrets"`
}

// A key of /etc/pupitre/env and the fact that it holds something: a value never travels in a status.
type secret struct {
	Key string `json:"key"`
	Set bool   `json:"set"`
}

type doneResult struct {
	Done bool `json:"done"`
}

func RegisterCommands(server *protocol.Server, runner *modules.Engine) {
	server.Register("secrets.status", command(runner, func(ctx *modules.Context, _ json.RawMessage) (any, error) {
		keys, err := env.Keys(ctx)
		if err != nil {
			return nil, err
		}

		listed := make([]secret, 0, len(keys))
		for _, key := range keys {
			listed = append(listed, secret{Key: key, Set: true})
		}

		return secretsResult{Secrets: listed}, nil
	}))

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

	server.Register("secrets.set", set(runner))
}

// The value comes from the secret line and nowhere else: params carries the key alone, and the key alone is ever written down.
func set(runner *modules.Engine) protocol.Handler {
	return func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Key string `json:"key"`
		}](raw)
		if err != nil {
			return nil, err
		}

		value, err := valueOf(ctx.Secrets, params.Key)
		if err != nil {
			return nil, err
		}

		var result any
		failure := runner.Command(onepassword.ID, modules.Emitter(ctx), func(mctx *modules.Context) error {
			if _, err := env.Set(mctx, params.Key, value); err != nil {
				return err
			}

			result = doneResult{Done: true}

			return nil
		})
		if failure != nil {
			return nil, failure
		}

		return result, nil
	}
}

func valueOf(line json.RawMessage, key string) (string, error) {
	var values map[string]string
	if err := json.Unmarshal(line, &values); err != nil {
		return "", protocol.NewError(contract.ErrorBadRequest, "ligne de secrets illisible").
			WithFix(`Écris la valeur sur la ligne suivante, sous la forme {"` + key + `": "<valeur>"}.`)
	}

	value, given := values[key]
	if !given || value == "" {
		return "", protocol.NewError(contract.ErrorBadRequest, "la ligne de secrets ne porte pas de valeur pour "+key).
			WithFix(`Écris la valeur sur la ligne suivante, sous la forme {"` + key + `": "<valeur>"}.`)
	}

	return value, nil
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
		return params, protocol.NewError(contract.ErrorBadRequest, "paramètres illisibles : "+err.Error())
	}

	return params, nil
}
