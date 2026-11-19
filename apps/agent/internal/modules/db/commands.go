package db

import (
	"encoding/json"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/db/dumps"
	"pupitre.studio/agent/internal/modules/db/query"
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

type target struct {
	Engine string `json:"engine"`
	Name   string `json:"name"`
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

	server.Register("db.query", queryCommand(runner))
}

func command(runner *modules.Engine, run func(engine, *modules.Context, string) (any, error)) protocol.Handler {
	return func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		var params target
		if err := json.Unmarshal(raw, &params); err != nil {
			return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("command.params.unreadable", err.Error()))
		}

		chosen, err := params.engine()
		if err != nil {
			return nil, err
		}

		var result any
		err = runner.Command(chosen.id, modules.Emitter(ctx), func(mctx *modules.Context) error {
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

// Inspect, not Command: a query changes no configuration, so it neither waits on nor blocks an installation.
func queryCommand(runner *modules.Engine) protocol.Handler {
	return func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		var params struct {
			target
			Query string `json:"query"`
		}

		if err := json.Unmarshal(raw, &params); err != nil {
			return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("command.params.unreadable", err.Error()))
		}

		chosen, known := queriers[params.Engine]
		if !known {
			return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("db.engine.unknown", params.Engine)).
				WithFix(i18n.T("db.query.engine.fix"))
		}

		if err := params.checkName(); err != nil {
			return nil, err
		}

		var result query.Result
		err := runner.Inspect(chosen.id, func(mctx *modules.Context) error {
			if !mctx.Bool(query.AccessKey) {
				name := mctx.Manifest().Name

				return protocol.NewError(contract.ErrorAccessRefused, i18n.T("db.query.refused", name)).
					WithFix(i18n.T("db.query.refused.fix", name))
			}

			value, err := chosen.query(mctx, params.Name, params.Query)
			result = value

			return err
		})
		if err != nil {
			return nil, err
		}

		return result, nil
	}
}

func (t target) engine() (engine, error) {
	chosen, known := engines[t.Engine]
	if !known {
		return engine{}, protocol.NewError(contract.ErrorBadRequest, i18n.T("db.engine.unknown", t.Engine)).
			WithFix(i18n.T("db.engine.unknown.fix"))
	}

	return chosen, t.checkName()
}

// The name reaches an identifier, a path under ~/dumps and an argv as it is.
func (t target) checkName() error {
	if t.Name != "" && !dumps.SafeName(t.Name) {
		return protocol.NewError(contract.ErrorBadRequest, i18n.T("db.name.invalid", t.Name)).
			WithFix(i18n.T("db.name.invalid.fix"))
	}

	return nil
}
