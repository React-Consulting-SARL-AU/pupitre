package exposure

import (
	"encoding/json"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure/cloudflare"
	"pupitre.studio/agent/internal/protocol"
)

func RegisterCommands(server *protocol.Server, runner *modules.Engine) {
	server.Register("tunnel.status", command(runner, cloudflare.Status))
	server.Register("tunnel.sync", command(runner, cloudflare.Sync))
	server.Register("tunnel.restart", command(runner, cloudflare.Restart))
}

func command(runner *modules.Engine, run func(*modules.Context) (cloudflare.Report, error)) protocol.Handler {
	return func(ctx *protocol.Context, _ json.RawMessage) (any, error) {
		var report cloudflare.Report

		err := runner.Command(cloudflare.ID, modules.Emitter(ctx), func(mctx *modules.Context) error {
			value, err := run(mctx)
			report = value

			return err
		})
		if err != nil {
			return nil, err
		}

		return report, nil
	}
}
