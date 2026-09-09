package neon

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "tool.neon"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "tool",
		Name:      "Neon",
		Summary:   i18n.T("module.tool.neon.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 0, DiskMB: 128},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key:      "api_key",
				Kind:     contract.FieldSecret,
				Label:    i18n.T("module.tool.neon.api_key.label"),
				Help:     i18n.T("module.tool.neon.api_key.help"),
				HintText: i18n.T("module.tool.neon.api_key.hint"),
				HintURL:  "https://console.neon.tech/app/settings/api-keys",
				Required: true,
			},
		},
		Mandatory: false,
		Since:     "0.3.0",
	}
}
