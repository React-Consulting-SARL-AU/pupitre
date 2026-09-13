// Package cloudflare exposes the projects through a Cloudflare tunnel: the app creates it on the client's account, the server only runs it.
package cloudflare

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure/cloudflared"
	"pupitre.studio/agent/internal/modules/exposure/routes"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	Unit = cloudflared.Unit

	// Provider is the one name this module answers to: the marker on disk, and the name its report carries.
	Provider = "cloudflare"

	modePath = routes.ModePath
)

// The marker /etc/pupitre/exposure says which exposure holds the machine; this one writes its name there like ssh and caddy do.
var mode = []byte(Provider + "\n")

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func ours(ctx *modules.Context) bool {
	return cloudflared.Installed(ctx) && file.Same(ctx, modePath, mode)
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !ours(ctx) {
		return modules.Status{}, nil
	}

	version, err := cloudflared.Version(ctx)
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{
		Installed:  true,
		Version:    version,
		Configured: file.Exists(ctx, cloudflared.ConfigPath) && file.Exists(ctx, cloudflared.CredentialsPath),
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return ctx.Step("install-cloudflared", func() (modules.Outcome, error) {
		if cloudflared.Installed(ctx) {
			return modules.Skipped, nil
		}

		return modules.Done, cloudflared.Install(ctx)
	})
}

// The domain is stored before the ingress is written: the registry resolves the routes of the repository's rows against it.
func (m Module) Configure(ctx *modules.Context) error {
	credentials, err := writeCredentials(ctx)
	if err != nil {
		return err
	}

	if err := routes.MoveRoutes(ctx); err != nil {
		return err
	}

	if err := storeDomain(ctx); err != nil {
		return err
	}

	ingress, err := writeIngress(ctx)
	if err != nil {
		return err
	}

	if err := declareMode(ctx); err != nil {
		return err
	}

	return service(ctx, credentials || ingress)
}

func writeCredentials(ctx *modules.Context) (bool, error) {
	changed := false

	err := ctx.Step("write-credentials", func() (modules.Outcome, error) {
		wanted := cloudflared.Credentials{
			AccountTag:   ctx.String("account_tag"),
			TunnelID:     ctx.String("tunnel_id"),
			TunnelSecret: ctx.Secret("tunnel_secret"),
		}

		if file.Same(ctx, cloudflared.CredentialsPath, wanted.Encode()) {
			return modules.Skipped, nil
		}

		changed = true

		return modules.Done, cloudflared.WriteCredentials(ctx, wanted)
	})

	return changed, err
}

func writeIngress(ctx *modules.Context) (bool, error) {
	changed := false

	err := ctx.Step("write-ingress", func() (modules.Outcome, error) {
		content := cloudflared.Ingress(ctx.String("tunnel_id"), ctx.String("domain"), cloudflared.Declared(ctx))
		if file.Same(ctx, cloudflared.ConfigPath, content) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(cloudflared.ConfigDir, 0o755); err != nil {
			return modules.Failed, err
		}

		changed = true

		return modules.Done, file.WriteAtomic(ctx, cloudflared.ConfigPath, content, 0o644)
	})

	return changed, err
}

func storeDomain(ctx *modules.Context) error {
	return ctx.Step("store-domain", func() (modules.Outcome, error) {
		changed, err := env.Set(ctx, env.DomainKey, ctx.String("domain"))
		if err != nil {
			return modules.Failed, err
		}

		if !changed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func declareMode(ctx *modules.Context) error {
	return ctx.Step("declare-mode", func() (modules.Outcome, error) {
		if file.Same(ctx, modePath, mode) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll("/etc/pupitre", 0o700); err != nil {
			return modules.Failed, err
		}

		return modules.Done, file.WriteAtomic(ctx, modePath, mode, 0o644)
	})
}

// A daemon already running keeps the credentials and the ingress it read at
// start: whichever of the two was rewritten, the tunnel it carries is not the
// one this run configured until it has been restarted.
func service(ctx *modules.Context, configChanged bool) error {
	written := false

	if err := ctx.Step("write-service", func() (modules.Outcome, error) {
		if file.Same(ctx, cloudflared.UnitPath, cloudflared.UnitFile) {
			return modules.Skipped, nil
		}

		written = true

		return modules.Done, systemd.WriteUnit(ctx, Unit, cloudflared.UnitFile)
	}); err != nil {
		return err
	}

	if err := ctx.Step("enable-service", func() (modules.Outcome, error) {
		running := systemd.Active(ctx, Unit)

		if running && !written && !configChanged {
			return modules.Skipped, nil
		}

		if err := systemd.Enable(ctx, Unit); err != nil {
			return modules.Failed, cloudflared.StartFailure(ctx, err)
		}

		// A unit already running keeps its old configuration until it is
		// restarted; one that was down was just started by enable --now, and
		// restarting it again would only make a failed start be waited twice.
		if running {
			if err := systemd.Restart(ctx, Unit); err != nil {
				return modules.Failed, cloudflared.StartFailure(ctx, err)
			}
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return ctx.Step("verify-tunnel", func() (modules.Outcome, error) {
		if err := cloudflared.Registered(ctx); err != nil {
			return modules.Failed, err
		}

		if serving, said := cloudflared.Serving(ctx); !serving {
			ctx.Warn(i18n.T("warn.cloudflare.tunnel.unready", said))
		}

		return modules.Done, nil
	})
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-cloudflared", func() (modules.Outcome, error) {
		upgraded, err := apt.Upgrade(ctx, cloudflared.Pkg)
		if err != nil {
			return modules.Failed, err
		}

		if !upgraded {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The tunnel and its records live on the client's Cloudflare account: uninstalling gives back the machine, and touches neither.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := ctx.Step("stop-service", func() (modules.Outcome, error) {
		if !file.Exists(ctx, cloudflared.UnitPath) {
			return modules.Skipped, nil
		}

		if err := systemd.Disable(ctx, Unit); err != nil {
			return modules.Failed, err
		}

		removed, err := file.Remove(ctx, cloudflared.UnitPath)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	if err := ctx.Step("remove-config", func() (modules.Outcome, error) {
		cleared := false

		paths := []string{cloudflared.ConfigPath, cloudflared.CredentialsPath, cloudflared.SourcePath}
		if file.Same(ctx, modePath, mode) {
			paths = append(paths, modePath)
		}

		for _, path := range paths {
			removed, err := file.Remove(ctx, path)
			if err != nil {
				return modules.Failed, err
			}

			cleared = cleared || removed
		}

		if !cleared {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	if err := ctx.Step("remove-cloudflared", func() (modules.Outcome, error) {
		if !cloudflared.Installed(ctx) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Remove(ctx, cloudflared.Pkg)
	}); err != nil {
		return err
	}

	return ctx.Step("forget-domain", func() (modules.Outcome, error) {
		forgotten, err := env.Unset(ctx, env.DomainKey)
		if err != nil {
			return modules.Failed, err
		}

		if !forgotten {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func (m Module) Status(ctx *modules.Context) (modules.Status, error) {
	status, err := m.Check(ctx)
	if err != nil {
		return modules.Status{}, err
	}

	status.State = systemd.State(ctx, Unit)
	status.Unit = Unit
	status.Credentials = map[string]string{i18n.T("module.exposure.cloudflare.credential.domain.label"): env.DomainKey}

	return status, nil
}
