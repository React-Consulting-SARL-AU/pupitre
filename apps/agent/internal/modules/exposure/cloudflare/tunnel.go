package cloudflare

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	StateRunning = "running"
	StateStopped = "stopped"
	StateFailed  = "failed"
	StateAbsent  = "absent"
)

type Report struct {
	Installed bool    `json:"installed"`
	State     string  `json:"state"`
	Routes    []Route `json:"routes"`
}

func Status(ctx *modules.Context) (Report, error) {
	installed := apt.Installed(ctx, pkg)

	return Report{Installed: installed, State: state(ctx, installed), Routes: routes(domainOf(ctx), declared(ctx))}, nil
}

// The ingress is regenerated from the project registry, which is the only place a subdomain is ever declared.
func Sync(ctx *modules.Context) (Report, error) {
	if !apt.Installed(ctx, pkg) {
		return Report{}, modules.NotInstalled(ID, manifest().Name)
	}

	if err := ctx.RequireFields(); err != nil {
		return Report{}, err
	}

	id := recorded(ctx).TunnelID
	if id == "" {
		return Report{}, modules.NotInstalled(ID, manifest().Name)
	}

	changed, err := writeIngress(ctx, id)
	if err != nil {
		return Report{}, err
	}

	if changed {
		if err := ctx.Step("restart-service", func() (modules.Outcome, error) {
			return modules.Done, systemd.Restart(ctx, Unit)
		}); err != nil {
			return Report{}, err
		}
	}

	if err := syncRecords(ctx, id); err != nil {
		return Report{}, err
	}

	return Status(ctx)
}

func Restart(ctx *modules.Context) (Report, error) {
	if !file.Exists(ctx, unitPath) {
		return Report{}, modules.NotInstalled(ID, manifest().Name)
	}

	if err := ctx.Step("restart-service", func() (modules.Outcome, error) {
		return modules.Done, systemd.Restart(ctx, Unit)
	}); err != nil {
		return Report{}, err
	}

	return Status(ctx)
}

// The configured value first, then the one the configuration left in /etc/pupitre/env: a command runs long after the install.
func domainOf(ctx *modules.Context) string {
	if domain := ctx.String("domain"); domain != "" {
		return domain
	}

	domain, _, _ := env.Get(ctx, env.DomainKey)

	return domain
}

func state(ctx *modules.Context, installed bool) string {
	if !installed || !file.Exists(ctx, unitPath) {
		return StateAbsent
	}

	switch systemd.State(ctx, Unit) {
	case contract.ServiceRunning:
		return StateRunning
	case contract.ServiceFailed:
		return StateFailed
	case contract.ServiceStopped:
		return StateStopped
	}

	return StateAbsent
}
