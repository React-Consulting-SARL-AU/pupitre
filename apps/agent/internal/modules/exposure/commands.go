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

// A machine nothing exposes says so, rather than borrowing the answer of a module it does not run.
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

// Syncing or restarting an exposure that is not there is not a state, it is a mistake: the catalogue is where one is added.
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

// A status only reads, so it neither waits for the run lock nor asks for the right of use: an install under way is not a reason to answer absent.
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

// The app asks the server what its exposure is doing, never a vendor by name:
// the module that is actually there answers, and nobody answers for it. A
// module that could not be read is an error, not an absence: absent is what
// once had a live tunnel deleted by name.
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
