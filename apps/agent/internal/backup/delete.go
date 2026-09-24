package backup

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	module "pupitre.studio/agent/internal/modules/core/backup"
	"pupitre.studio/agent/internal/protocol"
)

// Delete removes a backup of this server from the bucket, object by object, then its reference on the platform.
func (s *Service) Delete(id string) (contract.BackupDeleteResult, error) {
	var result contract.BackupDeleteResult

	err := s.options.Engine.Command(module.ID, nil, func(ctx *modules.Context) error {
		deleted, err := s.delete(ctx, id)
		result = deleted

		return err
	})

	return result, err
}

func (s *Service) delete(ctx *modules.Context, id string) (contract.BackupDeleteResult, error) {
	if !idPattern.MatchString(id) {
		return contract.BackupDeleteResult{}, protocol.NewError(contract.ErrorBadRequest, i18n.T("backup.location.invalid", id)).
			WithFix(i18n.T("backup.location.invalid.fix"))
	}

	settings := module.Read(ctx)
	if !settings.Configured() {
		return contract.BackupDeleteResult{}, unconfigured()
	}

	serverID := s.ServerID()
	if serverID == "" {
		return contract.BackupDeleteResult{}, unnamed()
	}

	client := s.bucket(settings.Client())
	prefix := settings.ServerPrefix(serverID) + id + "/"

	removed, err := s.remove(client, prefix)
	if err != nil {
		return contract.BackupDeleteResult{}, module.StorageRefused(err)
	}

	record := s.record(ctx)
	record.Pending = withoutDeclarations(record.Pending, []string{id})
	if record.Last != nil && record.Last.ID == id {
		record.Last = nil
	}

	forgotten := s.forgetOne(id) == nil
	if !forgotten {
		record.Forgotten = append(record.Forgotten, id)
	}

	if err := s.keep(ctx, record); err != nil {
		return contract.BackupDeleteResult{}, err
	}

	return contract.BackupDeleteResult{Deleted: removed > 0 || forgotten}, nil
}
