package neon

import (
	"runtime"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	BinaryPath = "/usr/local/bin/neon"

	stagePath = "/tmp/pupitre-neonctl"
	assetURL  = "https://github.com/neondatabase/neonctl/releases/latest/download/neonctl-linux-"

	keyKey    = "NEON_API_KEY"
	keyPrefix = "NEON_"
)

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !file.Exists(ctx, BinaryPath) {
		return modules.Status{}, nil
	}

	_, stored, err := env.Get(ctx, keyKey)
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{Installed: true, Configured: stored, Version: version(ctx)}, nil
}

func version(ctx *modules.Context) string {
	out, err := sys.Exec(ctx, sys.Command{Argv: []string{BinaryPath, "--version"}})
	if err != nil {
		return ""
	}

	return strings.TrimSpace(out.Stdout)
}

func (Module) Install(ctx *modules.Context) error {
	return ctx.Step("install-neonctl", func() (modules.Outcome, error) {
		if file.Exists(ctx, BinaryPath) {
			return modules.Skipped, nil
		}

		return modules.Done, download(ctx, BinaryPath)
	})
}

func download(ctx *modules.Context, destination string) error {
	if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"curl", "-fsSL", "--proto", "=https", "--tlsv1.2", "-o", destination, asset()}}); err != nil {
		return err
	}

	_, err := sys.Exec(ctx, sys.Command{Argv: []string{"chmod", "0755", destination}})

	return err
}

// Neon publishes one binary per architecture, under the name Node gives it rather than the one Go uses.
func asset() string {
	if runtime.GOARCH == "arm64" {
		return assetURL + "arm64"
	}

	return assetURL + "x64"
}

// The key lands in /etc/pupitre/env, where every shell of the machine reads it: the CLI authenticates itself without a login.
func (Module) Configure(ctx *modules.Context) error {
	return ctx.Step("store-key", func() (modules.Outcome, error) {
		changed, err := env.Set(ctx, keyKey, ctx.Secret("api_key"))
		if err != nil {
			return modules.Failed, err
		}

		if !changed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-neonctl", func() (modules.Outcome, error) {
		if err := download(ctx, stagePath); err != nil {
			return modules.Failed, err
		}

		staged, err := file.Read(ctx, stagePath)
		if err != nil {
			return modules.Failed, err
		}

		if file.Same(ctx, BinaryPath, staged) {
			_, err := file.Remove(ctx, stagePath)

			return modules.Skipped, err
		}

		if err := file.WriteAtomic(ctx, BinaryPath, staged, 0o755); err != nil {
			return modules.Failed, err
		}

		if _, err := file.Remove(ctx, stagePath); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The Neon account belongs to the client: uninstalling gives back the machine and its secrets, never a project or a branch.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := ctx.Step("remove-neonctl", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, BinaryPath)
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

	return ctx.Step("forget-key", func() (modules.Outcome, error) {
		keys, err := env.Keys(ctx)
		if err != nil {
			return modules.Failed, err
		}

		forgotten := false

		for _, key := range keys {
			if !strings.HasPrefix(key, keyPrefix) {
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

	status.State = contract.ServiceStopped
	if status.Installed {
		status.State = contract.ServiceRunning
	}

	status.Credentials = map[string]string{i18n.T("module.tool.neon.api_key.label"): keyKey}

	return status, nil
}
