package modtest

import (
	"errors"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
)

type Failing struct {
	ID       string
	Requires []string
	FailAt   string
	Message  string
	WarnWith string
	Panics   bool
	Present  bool
}

func (m Failing) Manifest() contract.Manifest {
	return contract.Manifest{
		ID:        m.ID,
		Category:  categoryOf(m.ID),
		Name:      "Demo " + m.ID,
		Summary:   "Module de démonstration dont une étape échoue.",
		Requires:  m.Requires,
		Resources: contract.Resources{RAMMB: 16, DiskMB: 8},
		Arch:      []string{"amd64", "arm64"},
		Since:     "0.0.0",
	}
}

func (m Failing) step(ctx *modules.Context, name string) error {
	return ctx.Step(name, func() (modules.Outcome, error) {
		if m.Panics && m.FailAt == name {
			panic("panique volontaire dans " + name)
		}

		if m.FailAt == name {
			message := m.Message
			if message == "" {
				message = "échec volontaire de " + name
			}

			return modules.Failed, errors.New(message)
		}

		return modules.Done, nil
	})
}

func (m Failing) Check(_ *modules.Context) (modules.Status, error) {
	return modules.Status{Installed: m.Present}, nil
}

func (m Failing) Install(ctx *modules.Context) error {
	if err := m.step(ctx, "prepare"); err != nil {
		return err
	}

	return m.step(ctx, "install-package")
}

func (m Failing) Configure(ctx *modules.Context) error {
	if m.WarnWith != "" {
		ctx.Warn(m.WarnWith)
	}

	if err := m.step(ctx, "write-config"); err != nil {
		return err
	}

	return m.step(ctx, "enable-service")
}

func (m Failing) Upgrade(ctx *modules.Context) error {
	if err := m.step(ctx, "upgrade-package"); err != nil {
		return err
	}

	return m.Configure(ctx)
}

func (m Failing) Uninstall(ctx *modules.Context) error {
	if err := m.step(ctx, "stop-service"); err != nil {
		return err
	}

	return m.step(ctx, "remove-package")
}

func (m Failing) Status(_ *modules.Context) (modules.Status, error) {
	return modules.Status{Installed: m.Present, State: contract.ServiceFailed}, nil
}
