package modtest

import (
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

type Passing struct {
	ID        string
	Requires  []string
	Conflicts []string
	Package   string
	Unit      string
	EnvKey    string
	Port      int
}

func (m Passing) Manifest() contract.Manifest {
	fields := []contract.Field{
		{Key: "port", Kind: contract.FieldNumber, Label: "Port", Required: false, Default: 8080},
	}
	if m.EnvKey != "" {
		fields = append(fields, contract.Field{Key: "password", Kind: contract.FieldSecret, Label: "Mot de passe", Required: true, Generate: true})
	}

	return contract.Manifest{
		ID:        m.ID,
		Category:  categoryOf(m.ID),
		Name:      "Demo " + m.ID,
		Summary:   "Module de démonstration qui réussit.",
		Requires:  m.Requires,
		Conflicts: m.Conflicts,
		Resources: contract.Resources{RAMMB: 16, DiskMB: 8},
		Arch:      []string{"amd64", "arm64"},
		Fields:    fields,
		Provides:  []string{"demo:" + m.ID},
		Since:     "0.0.0",
	}
}

func (m Passing) configPath() string {
	return "/etc/pupitre/demo/" + m.ID + ".conf"
}

func (m Passing) pkg() string {
	if m.Package == "" {
		return strings.ReplaceAll(m.ID, ".", "-")
	}

	return m.Package
}

func (m Passing) config(ctx *modules.Context) []byte {
	return []byte("port=" + ctx.String("port") + "\n")
}

func (m Passing) Check(ctx *modules.Context) (modules.Status, error) {
	if !apt.Installed(ctx, m.pkg()) {
		return modules.Status{}, nil
	}

	version, err := apt.Version(ctx, m.pkg())
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{Installed: true, Version: version, Configured: file.Exists(ctx, m.configPath())}, nil
}

func (m Passing) Install(ctx *modules.Context) error {
	return ctx.Step("install-package", func() (modules.Outcome, error) {
		if apt.Installed(ctx, m.pkg()) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Install(ctx, m.pkg())
	})
}

func (m Passing) Configure(ctx *modules.Context) error {
	changed := false

	if err := ctx.Step("write-config", func() (modules.Outcome, error) {
		content := m.config(ctx)
		if file.Same(ctx, m.configPath(), content) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll("/etc/pupitre/demo", 0o700); err != nil {
			return modules.Failed, err
		}

		changed = true

		return modules.Done, file.WriteAtomic(ctx, m.configPath(), content, 0o640)
	}); err != nil {
		return err
	}

	if m.EnvKey != "" {
		if err := ctx.Step("store-password", func() (modules.Outcome, error) {
			stored, err := env.Set(ctx, m.EnvKey, ctx.Secret("password"))
			if err != nil {
				return modules.Failed, err
			}

			if !stored {
				return modules.Skipped, nil
			}

			return modules.Done, nil
		}); err != nil {
			return err
		}
	}

	if m.Unit == "" {
		return nil
	}

	return ctx.Step("enable-service", func() (modules.Outcome, error) {
		if systemd.Active(ctx, m.Unit) && !changed {
			return modules.Skipped, nil
		}

		if err := systemd.Enable(ctx, m.Unit); err != nil {
			return modules.Failed, err
		}

		return modules.Done, systemd.Restart(ctx, m.Unit)
	})
}

func (m Passing) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-package", func() (modules.Outcome, error) {
		upgraded, err := apt.Upgrade(ctx, m.pkg())
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

func (m Passing) Uninstall(ctx *modules.Context) error {
	if m.Unit != "" {
		if err := ctx.Step("stop-service", func() (modules.Outcome, error) {
			if !systemd.Active(ctx, m.Unit) {
				return modules.Skipped, nil
			}

			return modules.Done, systemd.Disable(ctx, m.Unit)
		}); err != nil {
			return err
		}
	}

	if err := ctx.Step("remove-package", func() (modules.Outcome, error) {
		if !apt.Installed(ctx, m.pkg()) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Remove(ctx, m.pkg())
	}); err != nil {
		return err
	}

	if err := ctx.Step("remove-config", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, m.configPath())
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

	if m.EnvKey == "" {
		return nil
	}

	return ctx.Step("forget-password", func() (modules.Outcome, error) {
		removed, err := env.Unset(ctx, m.EnvKey)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func (m Passing) Status(ctx *modules.Context) (modules.Status, error) {
	status, err := m.Check(ctx)
	if err != nil {
		return modules.Status{}, err
	}

	status.Port = m.Port
	status.Unit = m.Unit
	status.State = contract.ServiceUnknown
	if m.Unit != "" {
		status.State = systemd.State(ctx, m.Unit)
	}

	if m.EnvKey != "" {
		status.Credentials = map[string]string{"Mot de passe": m.EnvKey}
	}

	return status, nil
}

func categoryOf(id string) string {
	prefix, _, _ := strings.Cut(id, ".")

	switch prefix {
	case "db":
		return "database"
	case "core", "runtime", "ai", "editor", "exposure", "tool":
		return prefix
	}

	return "tool"
}
