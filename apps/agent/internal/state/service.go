package state

import (
	"context"
	"errors"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/systemd"
	"pupitre.studio/agent/internal/tmux"
)

func (r *Reader) StartService(id string) (contract.ServiceStatus, error) {
	return r.drive(id, systemd.Start)
}

func (r *Reader) StopService(id string) (contract.ServiceStatus, error) {
	return r.drive(id, systemd.Stop)
}

func (r *Reader) RestartService(id string) (contract.ServiceStatus, error) {
	return r.drive(id, systemd.Restart)
}

// The answer is the state the unit is in once systemd has had its say, read
// again after the action: never the intention. The credentials stay with
// service.status alone, which is the one command a store never holds.
func (r *Reader) drive(id string, act func(sys.Context, string) error) (contract.ServiceStatus, error) {
	service, err := r.unitOf(id)
	if err != nil {
		return contract.ServiceStatus{}, err
	}

	err = r.options.Command(id, nil, func(ctx *modules.Context) error {
		return act(ctx, service.Unit)
	})
	if err != nil {
		return contract.ServiceStatus{}, refused(service, err)
	}

	driven, err := r.ServiceStatus(id)
	if err != nil {
		return contract.ServiceStatus{}, err
	}

	driven.Credentials = nil

	return driven, nil
}

func (r *Reader) ServiceLogs(id string, lines int) ([]string, error) {
	service, err := r.unitOf(id)
	if err != nil {
		return nil, err
	}

	logs, err := systemd.Journal(r.ctx(), service.Unit, tailOf(lines))
	if err != nil {
		return nil, protocol.NewError(contract.ErrorInternal, i18n.T("state.service.journal.unreadable", service.Name, err.Error()))
	}

	return logs, nil
}

// With follow every line travels as an event, the tail included, for as long as a project's follow lasts — or as long as the channel reading it does.
func (r *Reader) FollowService(channel context.Context, id string, lines int, emit func(string)) error {
	service, err := r.unitOf(id)
	if err != nil {
		return err
	}

	if err := systemd.Follow(r.ctx(), channel, service.Unit, tailOf(lines), r.options.Follow.Limit, emit); err != nil {
		return protocol.NewError(contract.ErrorInternal, i18n.T("state.service.journal.unreadable", service.Name, err.Error()))
	}

	return nil
}

// A module without a unit — core.*, a tool — has nothing to start and nothing to read: the refusal says so, rather than driving an empty name.
func (r *Reader) unitOf(id string) (contract.ServiceStatus, error) {
	service, err := r.ServiceStatus(id)
	if err != nil {
		return contract.ServiceStatus{}, err
	}

	if service.Unit == "" {
		return contract.ServiceStatus{}, protocol.NewError(contract.ErrorBadRequest, i18n.T("state.service.noUnit", service.Name)).
			WithFix(i18n.T("state.service.noUnit.fix"))
	}

	return service, nil
}

func refused(service contract.ServiceStatus, err error) error {
	var known *protocol.Error
	if errors.As(err, &known) {
		return err
	}

	return protocol.NewError(contract.ErrorInternal, i18n.T("state.service.refused", service.Name, err.Error())).
		WithFix(i18n.T("state.service.refused.fix", service.ID))
}

func tailOf(lines int) int {
	if lines <= 0 {
		return tmux.DefaultLines
	}

	return lines
}
