package mongodb

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "db.mongodb"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "database",
		Name:      "MongoDB",
		Summary:   i18n.T("module.db.mongodb.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 1024, DiskMB: 2048},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "version", Kind: contract.FieldVersion, Label: i18n.T("module.db.mongodb.version.label"), Options: []string{"8.0", "7.0"}, Default: DefaultVersion},
			{Key: "port", Kind: contract.FieldNumber, Label: i18n.T("module.db.mongodb.port.label"), Help: i18n.T("module.db.mongodb.port.help"), Format: contract.FormatPort, Required: true, Default: DefaultPort, Min: 1024, Max: 65535},
			{Key: "app_user", Kind: contract.FieldText, Label: i18n.T("module.db.mongodb.app_user.label"), Help: i18n.T("module.db.mongodb.app_user.help"), Format: contract.FormatIdentifier, Required: true, Default: defaultAppUser},
			{Key: "app_password", Kind: contract.FieldSecret, Label: i18n.T("module.db.mongodb.app_password.label"), Help: i18n.T("module.db.mongodb.app_password.help"), Required: true, Generate: true},
		},
		Provides:  []string{"db:mongodb"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
