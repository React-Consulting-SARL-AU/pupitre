package protocol

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

var migrationCommands = contract.Enum("MigrationCommands")

func allowedWhileMigrating(cmd string) bool {
	for _, allowed := range migrationCommands {
		if allowed == cmd {
			return true
		}
	}

	return false
}

// Never guess at an unreadable configuration: a module handed misread values writes them back misread.
func MigrationRequired(config contract.ConfigRevision) *Error {
	switch config.State {
	case contract.ConfigFailed:
		return NewError(contract.ErrorMigrationRequired, i18n.T("migrate.required.failed")).
			WithFix(i18n.T("migrate.required.failed.fix"))
	case contract.ConfigAhead:
		return NewError(contract.ErrorMigrationRequired, i18n.T("migrate.required.ahead", config.Revision, config.Expected)).
			WithFix(i18n.T("migrate.required.ahead.fix"))
	default:
		return NewError(contract.ErrorMigrationRequired, i18n.T("migrate.required.pending", config.Revision, config.Expected)).
			WithFix(i18n.T("migrate.required.pending.fix"))
	}
}
