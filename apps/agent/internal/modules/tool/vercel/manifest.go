package vercel

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "tool.vercel"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "tool",
		Name:      "Vercel",
		Summary:   i18n.T("module.tool.vercel.summary"),
		Requires:  []string{"core.system", "runtime.node"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 256, DiskMB: 256},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key:      "token",
				Kind:     contract.FieldSecret,
				Label:    i18n.T("module.tool.vercel.token.label"),
				Required: true,
				Managed:  true,
			},
		},
		Connection: contract.ConnectionVercel,
		Runs:       false,
		Mandatory:  false,
		Since:      "0.2.0",
	}
}
