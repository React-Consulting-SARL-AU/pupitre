package caddy

import (
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure/gateway"
	"pupitre.studio/agent/internal/modules/exposure/routes"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

type Report = routes.Report

func Status(ctx *modules.Context) (Report, error) {
	installed := ours(ctx)

	report := Report{
		Installed: installed,
		State:     routes.State(ctx, installed && file.Exists(ctx, configPath), Unit),
		Routes:    routes.Published(ctx, domainOf(ctx)),
	}

	if installed {
		report.Provider = routes.Held(Provider)
	}

	return report, nil
}

func Sync(ctx *modules.Context) (Report, error) {
	if !ours(ctx) {
		return Report{}, modules.NotInstalled(ID, manifest().Name)
	}

	if domainOf(ctx) == "" {
		return Report{}, modules.NotInstalled(ID, manifest().Name)
	}

	// Enable, not a bare reload: a proxy synced before its module was upgraded would point at a gate not yet there.
	if err := gateway.Enable(ctx, routes.Published(ctx, domainOf(ctx))); err != nil {
		return Report{}, err
	}

	changed, err := writeCaddyfile(ctx)
	if err != nil {
		return Report{}, err
	}

	if changed {
		if err := ctx.Step("reload-service", func() (modules.Outcome, error) {
			return modules.Done, systemd.Reload(ctx, Unit)
		}); err != nil {
			return Report{}, err
		}
	}

	return Status(ctx)
}

func Restart(ctx *modules.Context) (Report, error) {
	if !ours(ctx) {
		return Report{}, modules.NotInstalled(ID, manifest().Name)
	}

	if err := ctx.Step("restart-service", func() (modules.Outcome, error) {
		return modules.Done, systemd.Restart(ctx, Unit)
	}); err != nil {
		return Report{}, err
	}

	return Status(ctx)
}
