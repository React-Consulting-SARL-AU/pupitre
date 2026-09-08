package redis

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "db.redis"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "database",
		Name:      "Redis",
		Summary:   i18n.T("module.db.redis.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 128, DiskMB: 256},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "password", Kind: contract.FieldSecret, Label: i18n.T("module.db.redis.password.label"), Required: true, Generate: true},
			{Key: "port", Kind: contract.FieldNumber, Label: i18n.T("module.db.redis.port.label"), Help: i18n.T("module.db.redis.port.help"), Format: contract.FormatPort, Required: true, Default: DefaultPort, Min: 1024, Max: 65535},
			{Key: "persistence", Kind: contract.FieldBoolean, Label: i18n.T("module.db.redis.persistence.label"), Help: i18n.T("module.db.redis.persistence.help"), Required: false, Default: true},
			{Key: "maxmemory_mb", Kind: contract.FieldNumber, Label: i18n.T("module.db.redis.maxmemory_mb.label"), Help: i18n.T("module.db.redis.maxmemory_mb.help"), Required: false, Default: 0, Min: 0, Max: 262144},
		},
		Provides:  []string{"db:redis"},
		Mandatory: false,
		Since:     "0.3.0",
	}
}
