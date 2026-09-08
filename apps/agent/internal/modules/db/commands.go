package db

import (
	"encoding/json"
	"pupitre.studio/agent/internal/i18n"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/protocol"
)

type dumpResult struct {
	Path      string `json:"path"`
	SizeBytes int64  `json:"size_bytes"`
}

type importResult struct {
	Imported []string `json:"imported"`
}

type shellResult struct {
	Command string `json:"command"`
}

type urlResult struct {
	URL string `json:"url"`
}

func RegisterCommands(server *protocol.Server, runner *modules.Engine) {
	server.Register("db.dump", command(runner, func(chosen engine, ctx *modules.Context, name string) (any, error) {
		path, size, err := chosen.dump(ctx, name)

		return dumpResult{Path: path, SizeBytes: size}, err
	}))

	server.Register("db.import", command(runner, func(chosen engine, ctx *modules.Context, name string) (any, error) {
		imported, err := chosen.load(ctx, name)
		if imported == nil {
			imported = []string{}
		}

		return importResult{Imported: imported}, err
	}))

	server.Register("db.shell", command(runner, func(chosen engine, ctx *modules.Context, name string) (any, error) {
		line, err := chosen.shell(ctx, name)

		return shellResult{Command: line}, err
	}))

	server.Register("db.url", command(runner, func(chosen engine, ctx *modules.Context, name string) (any, error) {
		url, err := chosen.url(ctx, name)

		return urlResult{URL: url}, err
	}))
}

func command(runner *modules.Engine, run func(engine, *modules.Context, string) (any, error)) protocol.Handler {
	return func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		var params struct {
			Engine string `json:"engine"`
			Name   string `json:"name"`
		}
		if err := json.Unmarshal(raw, &params); err != nil {
			return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("command.params.unreadable", err.Error()))
		}

		chosen, known := engines[params.Engine]
		if !known {
			return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("db.engine.unknown", params.Engine)).
				WithFix(i18n.T("db.engine.unknown.fix"))
		}

		var result any
		err := runner.Command(chosen.id, modules.Emitter(ctx), func(mctx *modules.Context) error {
			value, err := run(chosen, mctx, params.Name)
			result = value

			return err
		})
		if err != nil {
			return nil, err
		}

		return result, nil
	}
}
