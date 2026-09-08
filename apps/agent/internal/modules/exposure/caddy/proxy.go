package caddy

import (
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure/routes"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

type Report = routes.Report

func Status(ctx *modules.Context) (Report, error) {
	installed := apt.Installed(ctx, pkg)

	report := Report{
		Installed: installed,
		State:     routes.State(ctx, installed && file.Exists(ctx, configPath), Unit),
		Routes:    routes.For(domainOf(ctx), routes.Declared(ctx)),
	}

	if installed {
		report.Provider = routes.Held(Provider)
	}

	return report, nil
}

// The Caddyfile is regenerated from the project registry, which is the only place a subdomain is ever declared.
func Sync(ctx *modules.Context) (Report, error) {
	if !apt.Installed(ctx, pkg) {
		return Report{}, modules.NotInstalled(ID, manifest().Name)
	}

	if domainOf(ctx) == "" {
		return Report{}, modules.NotInstalled(ID, manifest().Name)
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
	if !apt.Installed(ctx, pkg) {
		return Report{}, modules.NotInstalled(ID, manifest().Name)
	}

	if err := ctx.Step("restart-service", func() (modules.Outcome, error) {
		return modules.Done, systemd.Restart(ctx, Unit)
	}); err != nil {
		return Report{}, err
	}

	return Status(ctx)
}
