package cloudflare

import (
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure/cloudflared"
	"pupitre.studio/agent/internal/modules/exposure/routes"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

type Report = routes.Report

func Status(ctx *modules.Context) (Report, error) {
	installed := ours(ctx)

	report := Report{
		Installed: installed,
		State:     routes.State(ctx, installed && file.Exists(ctx, cloudflared.UnitPath), Unit),
		Routes:    routes.For(domainOf(ctx), cloudflared.Declared(ctx)),
	}

	if installed {
		report.Provider = routes.Held(Provider)
	}

	return report, nil
}

// DNS is the app's job: it reads these routes to write the records.
func Sync(ctx *modules.Context) (Report, error) {
	if !ours(ctx) {
		return Report{}, modules.NotInstalled(ID, manifest().Name)
	}

	id := cloudflared.Recorded(ctx).TunnelID
	if id == "" {
		return Report{}, modules.NotInstalled(ID, manifest().Name)
	}

	content := cloudflared.Ingress(id, domainOf(ctx), cloudflared.Declared(ctx))

	if err := ctx.Step("write-ingress", func() (modules.Outcome, error) {
		if file.Same(ctx, cloudflared.ConfigPath, content) {
			return modules.Skipped, nil
		}

		if err := file.WriteAtomic(ctx, cloudflared.ConfigPath, content, 0o644); err != nil {
			return modules.Failed, err
		}

		return modules.Done, systemd.Restart(ctx, Unit)
	}); err != nil {
		return Report{}, err
	}

	return Status(ctx)
}

func Restart(ctx *modules.Context) (Report, error) {
	if !file.Exists(ctx, cloudflared.UnitPath) {
		return Report{}, modules.NotInstalled(ID, manifest().Name)
	}

	if err := ctx.Step("restart-service", func() (modules.Outcome, error) {
		return modules.Done, systemd.Restart(ctx, Unit)
	}); err != nil {
		return Report{}, err
	}

	return Status(ctx)
}

// Falls back to /etc/pupitre/env: a command runs long after the install, without its configuration.
func domainOf(ctx *modules.Context) string {
	if domain := ctx.String("domain"); domain != "" {
		return domain
	}

	domain, _, _ := env.Get(ctx, env.DomainKey)

	return domain
}
