package exposure

import (
	"encoding/json"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure/caddy"
	"pupitre.studio/agent/internal/modules/exposure/cloudflare"
	"pupitre.studio/agent/internal/modules/exposure/routes"
	"pupitre.studio/agent/internal/protocol"
)

type reporter = func(*modules.Context) (routes.Report, error)

type provider struct {
	id      string
	status  reporter
	sync    reporter
	restart reporter
}

var providers = []provider{
	{cloudflare.ID, cloudflare.Status, cloudflare.Sync, cloudflare.Restart},
	{caddy.ID, caddy.Status, caddy.Sync, caddy.Restart},
}

func RegisterCommands(server *protocol.Server, runner *modules.Engine) {
	server.Register("tunnel.status", status(runner))
	server.Register("tunnel.sync", acting(runner, func(p provider) reporter { return p.sync }))
	server.Register("tunnel.restart", acting(runner, func(p provider) reporter { return p.restart }))
}

func status(engine *modules.Engine) protocol.Handler {
	return func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		chosen, ok, err := installed(engine)
		if err != nil {
			return nil, err
		}

		if !ok {
			return routes.Report{State: routes.StateAbsent, Routes: []routes.Route{}}, nil
		}

		return inspect(engine, chosen, chosen.status)
	}
}

func acting(engine *modules.Engine, pick func(provider) reporter) protocol.Handler {
	return func(ctx *protocol.Context, _ json.RawMessage) (any, error) {
		chosen, ok, err := installed(engine)
		if err != nil {
			return nil, err
		}

		if !ok {
			return nil, protocol.NewError(contract.ErrorServiceNotFound, i18n.T("exposure.none")).
				WithFix(i18n.T("exposure.none.fix"))
		}

		return report(engine, ctx, chosen, pick(chosen))
	}
}

func report(engine *modules.Engine, ctx *protocol.Context, chosen provider, run reporter) (any, error) {
	var answer routes.Report

	err := engine.Command(chosen.id, modules.Emitter(ctx), func(mctx *modules.Context) error {
		value, err := run(mctx)
		answer = value

		return err
	})
	if err != nil {
		return nil, err
	}

	return answer, nil
}

// Read-only, so it skips the run lock and the entitlement: an install under way must not read as absent.
func inspect(engine *modules.Engine, chosen provider, run reporter) (any, error) {
	var answer routes.Report

	err := engine.Inspect(chosen.id, func(mctx *modules.Context) error {
		value, err := run(mctx)
		answer = value

		return err
	})
	if err != nil {
		return nil, err
	}

	return answer, nil
}

// Resync is tunnel.sync for a caller that already holds the run lock.
func Resync(sibling func(id string) (*modules.Context, bool)) (bool, error) {
	for _, candidate := range providers {
		ctx, known := sibling(candidate.id)
		if !known {
			continue
		}

		answer, err := candidate.status(ctx)
		if err != nil {
			return false, err
		}

		if answer.Installed {
			_, err := candidate.sync(ctx)

			return true, err
		}
	}

	return false, nil
}

// An unreadable module is an error, never an absence: answering absent once had a live tunnel deleted by name.
func installed(engine *modules.Engine) (provider, bool, error) {
	for _, candidate := range providers {
		present := false

		err := engine.Inspect(candidate.id, func(mctx *modules.Context) error {
			answer, err := candidate.status(mctx)
			present = answer.Installed

			return err
		})
		if err != nil {
			return provider{}, false, err
		}

		if present {
			return candidate, true, nil
		}
	}

	return provider{}, false, nil
}
