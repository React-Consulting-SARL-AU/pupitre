package openclaw

import (
	"errors"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/ai/agents"
	"pupitre.studio/agent/internal/modules/ai/providers"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	Program = "openclaw"
	Unit    = "pupitre-openclaw"

	Port = 18789

	tool       = "npm:openclaw"
	configDir  = agents.Home + "/.openclaw"
	envPath    = configDir + "/providers.env"
	configPath = configDir + "/openclaw.json"
	unitPath   = "/etc/systemd/system/" + Unit + ".service"

	// The least the gateway starts on; openclaw onboard extends it, and an existing file is never touched.
	seedConfig = `{"gateway":{"mode":"local","port":18789,"bind":"loopback"}}
`

	// The gateway reads unprefixed vendor names; the prefix only keeps them apart in /etc/pupitre/env.
	envPrefix = "OPENCLAW_"

	unitContent = `[Unit]
Description=OpenClaw gateway
After=network-online.target

[Service]
Type=simple
User=` + agents.User + `
WorkingDirectory=` + agents.Home + `
EnvironmentFile=` + envPath + `
Environment=PATH=` + mise.ShimsDir + `:/usr/local/bin:/usr/bin:/bin
ExecStart=%s gateway --port 18789
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`
)

// OpenClaw refuses an older Node at start; checking first saves mise a minute installing it for nothing.
var nodeFloors = map[int]int{24: 16, 26: 1}

var (
	cli = mise.CLI{Tool: tool, Program: Program}

	// OpenClaw writes its own AGENTS.md in its workspace, so it only gets the skills.
	target = agents.Target{ConfigDir: configDir, Skills: true}
)

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !cli.Present(ctx) {
		return modules.Status{}, nil
	}

	return modules.Status{
		Installed:  true,
		Configured: file.Exists(ctx, envPath) && agents.Configured(ctx, target),
		Version:    cli.Version(ctx),
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	if err := ctx.Step("check-node", func() (modules.Outcome, error) {
		if cli.Present(ctx) {
			return modules.Skipped, nil
		}

		installed := mise.Default(ctx, "node")
		if !nodeSupported(installed) {
			return modules.Failed, errors.New(i18n.T("modules.openclaw.node_too_old", installed))
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return cli.Install(ctx)
}

func nodeSupported(version string) bool {
	parts := strings.Split(strings.TrimPrefix(version, "v"), ".")
	if len(parts) < 2 {
		return false
	}

	major, err := strconv.Atoi(parts[0])
	if err != nil {
		return false
	}

	minor, err := strconv.Atoi(parts[1])
	if err != nil {
		return false
	}

	floor, gated := nodeFloors[major]
	if !gated {
		return major > 26
	}

	return minor >= floor
}

func (Module) Configure(ctx *modules.Context) error {
	found := providers.Parse(ctx.SecretList("providers"))

	rewritten, err := providers.WriteStep(ctx, providers.Render(found, ""), configDir, envPath, agents.User)
	if err != nil {
		return err
	}

	if err := providers.StoreStep(ctx, envPrefix, found); err != nil {
		return err
	}

	if err := seed(ctx); err != nil {
		return err
	}

	if err := agents.Deploy(ctx, target); err != nil {
		return err
	}

	return service(ctx, ctx.Bool("always_on"), rewritten)
}

func seed(ctx *modules.Context) error {
	return ctx.Step("seed-config", func() (modules.Outcome, error) {
		if file.Exists(ctx, configPath) {
			return modules.Skipped, nil
		}

		if err := file.WriteAtomic(ctx, configPath, []byte(seedConfig), 0o600); err != nil {
			return modules.Failed, err
		}

		return modules.Done, file.Chown(ctx, configPath, agents.User, agents.User)
	})
}

func service(ctx *modules.Context, alwaysOn, providersChanged bool) error {
	if !alwaysOn {
		return ctx.Step("disable-service", func() (modules.Outcome, error) {
			if !file.Exists(ctx, unitPath) {
				return modules.Skipped, nil
			}

			if err := systemd.Disable(ctx, Unit); err != nil {
				return modules.Failed, err
			}

			removed, err := file.Remove(ctx, unitPath)
			if err != nil {
				return modules.Failed, err
			}

			if !removed {
				return modules.Skipped, nil
			}

			return modules.Done, nil
		})
	}

	content := []byte(strings.Replace(unitContent, "%s", cli.Path(), 1))
	changed := providersChanged

	if err := ctx.Step("write-service", func() (modules.Outcome, error) {
		if file.Same(ctx, unitPath, content) {
			return modules.Skipped, nil
		}

		changed = true

		return modules.Done, systemd.WriteUnit(ctx, Unit, content)
	}); err != nil {
		return err
	}

	return ctx.Step("enable-service", func() (modules.Outcome, error) {
		if systemd.Active(ctx, Unit) && !changed {
			return modules.Skipped, nil
		}

		if err := systemd.Enable(ctx, Unit); err != nil {
			return modules.Failed, err
		}

		return modules.Done, systemd.Restart(ctx, Unit)
	})
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := cli.Upgrade(ctx); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The client's workspace, sessions and channels stay under ~/.openclaw.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := service(ctx, false, false); err != nil {
		return err
	}

	if err := cli.Remove(ctx); err != nil {
		return err
	}

	if err := ctx.Step("remove-providers", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, envPath)
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

	if err := forgetProviders(ctx); err != nil {
		return err
	}

	return agents.Forget(ctx, target)
}

func forgetProviders(ctx *modules.Context) error {
	return ctx.Step("forget-providers", func() (modules.Outcome, error) {
		keys, err := env.Keys(ctx)
		if err != nil {
			return modules.Failed, err
		}

		forgotten := false

		for _, key := range keys {
			if !strings.HasPrefix(key, envPrefix) {
				continue
			}

			removed, err := env.Unset(ctx, key)
			if err != nil {
				return modules.Failed, err
			}

			forgotten = forgotten || removed
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

	status.State = contract.ServiceUnknown
	if status.Installed {
		status.State = contract.ServiceRunning
	}

	if file.Exists(ctx, unitPath) {
		status.State = systemd.State(ctx, Unit)
		status.Unit = Unit
		status.Port = Port
	}

	return status, nil
}
