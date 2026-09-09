package mysql

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "db.mysql"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "database",
		Name:      i18n.T("module.db.mysql.name"),
		Summary:   i18n.T("module.db.mysql.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 1024, DiskMB: 2048},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "engine", Kind: contract.FieldSelect, Label: i18n.T("module.db.mysql.engine.label"), Help: i18n.T("module.db.mysql.engine.help"), Required: true, Default: mysqlEngine, Options: []string{mysqlEngine, mariadbEngine}},
			{Key: "port", Kind: contract.FieldNumber, Label: i18n.T("module.db.mysql.port.label"), Help: i18n.T("module.db.mysql.port.help"), Format: contract.FormatPort, Required: true, Default: DefaultPort, Min: 1024, Max: 65535},
			{Key: "app_user", Kind: contract.FieldText, Label: i18n.T("module.db.mysql.app_user.label"), Help: i18n.T("module.db.mysql.app_user.help"), Format: contract.FormatIdentifier, Required: true, Default: defaultAppAccount},
			{Key: "remote_user", Kind: contract.FieldText, Label: i18n.T("module.db.mysql.remote_user.label"), Help: i18n.T("module.db.mysql.remote_user.help"), HintText: i18n.T("module.db.remote.hint"), Format: contract.FormatIdentifier, Required: true, Default: defaultRemoteAccount},
			{Key: "app_password", Kind: contract.FieldSecret, Label: i18n.T("module.db.mysql.app_password.label"), Required: true, Generate: true},
			{Key: "remote_password", Kind: contract.FieldSecret, Label: i18n.T("module.db.mysql.remote_password.label"), Help: i18n.T("module.db.mysql.remote_password.help"), Required: true, Generate: true},
			{Key: "buffer_pool", Kind: contract.FieldText, Label: i18n.T("module.db.mysql.buffer_pool.label"), Help: i18n.T("module.db.mysql.buffer_pool.help"), HintText: i18n.T("module.db.mysql.buffer_pool.hint"), Format: contract.FormatSize, Required: false},
		},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
