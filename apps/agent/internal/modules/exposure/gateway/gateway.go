package gateway

import (
	"encoding/json"

	"pupitre.studio/agent/internal/access"
	"pupitre.studio/agent/internal/gate"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure/routes"
	"pupitre.studio/agent/internal/shots"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

const UnitPath = "/etc/systemd/system/" + gate.Unit + ".service"

// Root without a single capability, on a read-only system where /etc/pupitre shows only the gate's folder:
// it answers the internet, so it must reach nothing else of the server's secrets.
var UnitFile = []byte(`[Unit]
Description=Pupitre access gate
After=network.target

[Service]
Type=simple
ExecStart=` + shots.Binary + ` gate --dir=` + gate.Dir + ` --listen=` + gate.Address + `
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=2
NoNewPrivileges=yes
CapabilityBoundingSet=
AmbientCapabilities=
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
TemporaryFileSystem=/etc/pupitre:ro
BindReadOnlyPaths=` + gate.Dir + `

[Install]
WantedBy=multi-user.target
`)

// Before the exposure points at it: a name sent to a gate that is not up would answer 502.
func Enable(ctx *modules.Context, published []routes.Route) error {
	if err := ctx.Step("prepare-gate-access", func() (modules.Outcome, error) {
		changed, err := access.Ensure(ctx)
		if err != nil {
			return modules.Failed, err
		}

		if !changed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	routesChanged, err := writeRoutes(ctx, published)
	if err != nil {
		return err
	}

	written := false

	if err := ctx.Step("write-gate-service", func() (modules.Outcome, error) {
		if file.Same(ctx, UnitPath, UnitFile) {
			return modules.Skipped, nil
		}

		written = true

		return modules.Done, systemd.WriteUnit(ctx, gate.Unit, UnitFile)
	}); err != nil {
		return err
	}

	return ctx.Step("enable-gate-service", func() (modules.Outcome, error) {
		running := systemd.Active(ctx, gate.Unit)

		switch {
		case running && written:
			return modules.Done, systemd.Restart(ctx, gate.Unit)
		case running && routesChanged:
			return modules.Done, systemd.Reload(ctx, gate.Unit)
		case running:
			return modules.Skipped, nil
		}

		return modules.Done, systemd.Enable(ctx, gate.Unit)
	})
}

// A reload keeps the WebSockets the gate carries; the names it learns take effect on the next request.
func Publish(ctx *modules.Context, published []routes.Route) error {
	changed, err := writeRoutes(ctx, published)
	if err != nil || !changed {
		return err
	}

	return ctx.Step("reload-gate", func() (modules.Outcome, error) {
		if !systemd.Active(ctx, gate.Unit) {
			return modules.Skipped, nil
		}

		return modules.Done, systemd.Reload(ctx, gate.Unit)
	})
}

// The keys stay: a tunnel put back finds every key it had given out.
func Disable(ctx *modules.Context) error {
	if err := ctx.Step("stop-gate-service", func() (modules.Outcome, error) {
		if !file.Exists(ctx, UnitPath) {
			return modules.Skipped, nil
		}

		if err := systemd.Disable(ctx, gate.Unit); err != nil {
			return modules.Failed, err
		}

		if _, err := file.Remove(ctx, UnitPath); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return ctx.Step("forget-gate-routes", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, gate.RoutesPath)
		if err != nil || !removed {
			return modules.Skipped, err
		}

		return modules.Done, nil
	})
}

func Content(published []routes.Route) []byte {
	encoded, _ := json.MarshalIndent(gate.Routes{Routes: routes.Gate(published)}, "", "  ")

	return append(encoded, '\n')
}

func writeRoutes(ctx *modules.Context, published []routes.Route) (bool, error) {
	content := Content(published)
	changed := false

	err := ctx.Step("write-gate-routes", func() (modules.Outcome, error) {
		if file.SameAt(ctx, gate.RoutesPath, content, 0o600) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(gate.Dir, 0o700); err != nil {
			return modules.Failed, err
		}

		changed = true

		return modules.Done, file.WriteAtomic(ctx, gate.RoutesPath, content, 0o600)
	})

	return changed, err
}
