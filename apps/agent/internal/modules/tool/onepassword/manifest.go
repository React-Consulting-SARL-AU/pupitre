package onepassword

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "tool.1password"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "tool",
		Name:      "1Password",
		Summary:   i18n.T("module.tool.1password.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 64, DiskMB: 128},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key:      "service_account_token",
				Kind:     contract.FieldSecret,
				Label:    i18n.T("module.tool.1password.service_account_token.label"),
				Required: true,
				Managed:  true,
			},
		},
		Connection: contract.ConnectionOnePassword,
		Runs:       false,
		Mandatory:  false,
		Since:      "0.1.0",
	}
}
