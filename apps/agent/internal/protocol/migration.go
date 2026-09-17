package protocol

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

// The commands a server answers while its configuration is not the shape this
// binary reads, as the contract lists them.
var migrationCommands = contract.Enum("MigrationCommands")

func allowedWhileMigrating(cmd string) bool {
	for _, allowed := range migrationCommands {
		if allowed == cmd {
			return true
		}
	}

	return false
}

// A configuration the binary cannot read is not a configuration to guess at: a
// module handed values it misunderstands writes them back misunderstood. What
// stays open is the view of the machine, the diagnostic, and the ways out.
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
