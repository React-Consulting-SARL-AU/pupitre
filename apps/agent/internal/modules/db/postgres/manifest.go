package postgres

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "db.postgres"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "database",
		Name:      "PostgreSQL",
		Summary:   i18n.T("module.db.postgres.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 1024, DiskMB: 2048},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "version", Kind: contract.FieldVersion, Label: i18n.T("module.db.postgres.version.label"), Options: []string{"18", "17", "16"}, Default: DefaultVersion},
			{Key: "port", Kind: contract.FieldNumber, Label: i18n.T("module.db.postgres.port.label"), Help: i18n.T("module.db.postgres.port.help"), Format: contract.FormatPort, Required: true, Default: DefaultPort, Min: 1024, Max: 65535},
			{Key: "app_role", Kind: contract.FieldText, Label: i18n.T("module.db.postgres.app_role.label"), Help: i18n.T("module.db.postgres.app_role.help"), Format: contract.FormatIdentifier, Required: true, Default: defaultAppRole},
			{Key: "remote_role", Kind: contract.FieldText, Label: i18n.T("module.db.postgres.remote_role.label"), Help: i18n.T("module.db.postgres.remote_role.help"), HintText: i18n.T("module.db.remote.hint"), Format: contract.FormatIdentifier, Required: true, Default: defaultRemoteRole},
			{Key: "app_password", Kind: contract.FieldSecret, Label: i18n.T("module.db.postgres.app_password.label"), Required: true, Generate: true},
			{Key: "remote_password", Kind: contract.FieldSecret, Label: i18n.T("module.db.postgres.remote_password.label"), Help: i18n.T("module.db.postgres.remote_password.help"), Required: true, Generate: true},
		},
		Provides:  []string{"db:postgres"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
