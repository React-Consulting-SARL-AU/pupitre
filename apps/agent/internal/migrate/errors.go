package migrate

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
)

func unknownBackup(name string) error {
	return protocol.NewError(contract.ErrorBadRequest, i18n.T("migrate.backup.unknown", name)).
		WithFix(i18n.T("migrate.backup.unknown.fix"))
}

func busy() error {
	return protocol.NewError(contract.ErrorBusy, i18n.T("migrate.busy")).
		WithFix(i18n.T("migrate.busy.fix"))
}
