package hermes

import (
	"fmt"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/ai/agents"
	"pupitre.studio/agent/internal/modules/ai/providers"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	Program = "hermes"

	envPrefix = "HERMES_"

	Unit = "pupitre-hermes"

	tool        = "pipx:hermes-agent"
	configDir   = agents.Home + "/.config/hermes"
	envPath     = configDir + "/providers.env"
	unitPath    = "/etc/systemd/system/" + Unit + ".service"
	unitContent = `[Unit]
Description=Hermes Agent
After=network-online.target

[Service]
Type=simple
User=` + agents.User + `
WorkingDirectory=` + agents.ProjectsDir + `
EnvironmentFile=` + envPath + `
ExecStart=%s serve
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`
)

var (
	cli = mise.CLI{Tool: tool, Program: Program}

	target = agents.Target{ConfigDir: configDir, ContextFile: "AGENTS.md", Skills: true}
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
	return cli.Install(ctx)
}

func (Module) Configure(ctx *modules.Context) error {
	found := providers.Parse(ctx.SecretList("providers"))

	if err := writeProviders(ctx, found); err != nil {
		return err
	}

	if err := storeProviders(ctx, found); err != nil {
		return err
	}

	if err := agents.Deploy(ctx, target); err != nil {
		return err
	}

	return service(ctx, ctx.Bool("always_on"))
}

func writeProviders(ctx *modules.Context, found []providers.Provider) error {
	return ctx.Step("write-providers", func() (modules.Outcome, error) {
		content := providers.Render(found, envPrefix)
		if file.Same(ctx, envPath, content) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(configDir, 0o700); err != nil {
			return modules.Failed, err
		}

		if err := file.Chown(ctx, configDir, agents.User, agents.User); err != nil {
			return modules.Failed, err
		}

		if err := file.WriteAtomic(ctx, envPath, content, 0o600); err != nil {
			return modules.Failed, err
		}

		return modules.Done, file.Chown(ctx, envPath, agents.User, agents.User)
	})
}

func storeProviders(ctx *modules.Context, found []providers.Provider) error {
	return ctx.Step("store-providers", func() (modules.Outcome, error) {
		stored := false
		for _, entry := range found {
			changed, err := env.Set(ctx, entry.EnvKey(envPrefix), entry.Key)
			if err != nil {
				return modules.Failed, err
			}

			stored = stored || changed
		}

		if !stored {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

// Without "always on" Hermes is a command a session starts; the unit is what keeps it running between two of them.
func service(ctx *modules.Context, alwaysOn bool) error {
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

	content := []byte(fmt.Sprintf(unitContent, cli.Path()))
	changed := false

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

func (Module) Uninstall(ctx *modules.Context) error {
	if err := service(ctx, false); err != nil {
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
			if len(key) <= len(envPrefix) || key[:len(envPrefix)] != envPrefix {
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
	}

	status.Credentials = credentials(ctx)

	return status, nil
}

// The keys of /etc/pupitre/env, one per provider; a value never travels in a status.
func credentials(ctx *modules.Context) map[string]string {
	keys, err := env.Keys(ctx)
	if err != nil {
		return nil
	}

	named := map[string]string{}
	for _, key := range keys {
		if len(key) > len(envPrefix) && key[:len(envPrefix)] == envPrefix {
			named[key] = key
		}
	}

	if len(named) == 0 {
		return nil
	}

	return named
}
