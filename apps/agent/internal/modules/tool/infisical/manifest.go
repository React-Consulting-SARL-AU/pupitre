package infisical

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "tool.infisical"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "tool",
		Name:      "Infisical",
		Summary:   i18n.T("module.tool.infisical.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 0, DiskMB: 128},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key:      "domain",
				Kind:     contract.FieldText,
				Label:    i18n.T("module.tool.infisical.domain.label"),
				Format:   contract.FormatURL,
				Required: true,
				Default:  contract.Infisical.DefaultDomain,
				Managed:  true,
			},
			{
				Key:       "client_id",
				Kind:      contract.FieldText,
				Label:     i18n.T("module.tool.infisical.client_id.label"),
				Pattern:   contract.Infisical.ClientIDPattern,
				MaxLength: contract.Infisical.ClientIDMax,
				Required:  true,
				Managed:   true,
			},
			{
				Key:      "client_secret",
				Kind:     contract.FieldSecret,
				Label:    i18n.T("module.tool.infisical.client_secret.label"),
				Required: true,
				Managed:  true,
			},
		},
		Connection: contract.ConnectionInfisical,
		Runs:       false,
		Mandatory:  false,
		Since:      "2.4.0",
	}
}
