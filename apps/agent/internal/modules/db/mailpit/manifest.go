package mailpit

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "db.mailpit"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "database",
		Name:      "Mailpit",
		Summary:   i18n.T("module.db.mailpit.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 64, DiskMB: 128},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "smtp_port", Kind: contract.FieldNumber, Label: i18n.T("module.db.mailpit.smtp_port.label"), Help: i18n.T("module.db.mailpit.smtp_port.help"), Format: contract.FormatPort, Required: true, Default: DefaultSMTPPort, Min: 1024, Max: 65535},
			{Key: "http_port", Kind: contract.FieldNumber, Label: i18n.T("module.db.mailpit.http_port.label"), Help: i18n.T("module.db.mailpit.http_port.help"), Format: contract.FormatPort, Required: true, Default: DefaultHTTPPort, Min: 1024, Max: 65535},
		},
		Runs:      true,
		Mandatory: false,
		Since:     "0.2.0",
	}
}
