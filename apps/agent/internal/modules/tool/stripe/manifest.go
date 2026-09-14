package stripe

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "tool.stripe"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "tool",
		Name:      "Stripe",
		Summary:   i18n.T("module.tool.stripe.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 0, DiskMB: 64},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key:      "api_key",
				Kind:     contract.FieldSecret,
				Label:    i18n.T("module.tool.stripe.api_key.label"),
				Required: true,
				Managed:  true,
			},
		},
		Connection: contract.ConnectionStripe,
		Runs:       false,
		Mandatory:  false,
		Since:      "0.2.0",
	}
}
