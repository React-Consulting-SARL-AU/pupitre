package wrangler

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "tool.wrangler"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "tool",
		Name:      "Wrangler",
		Summary:   i18n.T("module.tool.wrangler.summary"),
		Requires:  []string{"core.system", "runtime.node"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 256, DiskMB: 256},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key:      "api_token",
				Kind:     contract.FieldSecret,
				Label:    i18n.T("module.tool.wrangler.api_token.label"),
				Required: true,
				Managed:  true,
			},
			{
				Key:      "account_id",
				Kind:     contract.FieldText,
				Label:    i18n.T("module.tool.wrangler.account_id.label"),
				Required: true,
				Managed:  true,
			},
		},
		Connection: contract.ConnectionWrangler,
		Runs:       false,
		Mandatory:  false,
		Since:      "0.2.0",
	}
}
