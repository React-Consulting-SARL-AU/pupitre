// Package backup is the module that points a server at the client's bucket; it puts nothing on the machine but its values in install.json.
package backup

import (
	"context"
	"errors"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/s3"
)

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

// The bucket is what only the machine can reach, and only with the secret the server already holds: a first install is proven by its own step instead.
func (Module) Preflight(ctx *modules.Context) []contract.FieldProblem {
	settings := Read(ctx)
	if !settings.Configured() {
		return []contract.FieldProblem{}
	}

	if err := Probe(context.Background(), reach(settings.Client()), probePrefix(ctx, settings)); err != nil {
		message, fix := Refusal(err)

		return []contract.FieldProblem{{Module: ID, Code: contract.ProblemConnection, Message: i18n.T("backup.storage.problem", message, fix)}}
	}

	return []contract.FieldProblem{}
}

// reach aims a client at its bucket as it is; the tests aim it at their own.
var reach = func(client s3.Client) s3.Client { return client }

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	settings := Read(ctx)
	if settings.Endpoint == "" || settings.Bucket == "" {
		return modules.Status{}, nil
	}

	return modules.Status{Installed: true, Configured: settings.Configured()}, nil
}

func (Module) Install(*modules.Context) error {
	return nil
}

func (Module) Configure(ctx *modules.Context) error {
	return ctx.Step("verify-bucket", func() (modules.Outcome, error) {
		settings := Read(ctx)
		if !Addressable(settings.Endpoint, settings.Bucket, settings.Region) {
			return modules.Failed, errors.New(i18n.T("backup.storage.address", settings.Endpoint))
		}

		if err := Probe(context.Background(), reach(settings.Client()), probePrefix(ctx, settings)); err != nil {
			message, fix := Refusal(err)

			return modules.Failed, errors.New(i18n.T("backup.storage.problem", message, fix))
		}

		return modules.Done, nil
	})
}

func (m Module) Upgrade(ctx *modules.Context) error {
	return m.Configure(ctx)
}

// The backups are the client's, in the client's bucket: uninstalling stops the schedule, which reads install.json, and leaves every object where it is.
func (Module) Uninstall(*modules.Context) error {
	return nil
}

func (m Module) Status(ctx *modules.Context) (modules.Status, error) {
	status, err := m.Check(ctx)
	if err != nil {
		return modules.Status{}, err
	}

	status.State = contract.ServiceStopped
	if status.Configured {
		status.State = contract.ServiceRunning
	}

	return status, nil
}
