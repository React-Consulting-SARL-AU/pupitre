package supabase

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "tool.supabase"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "tool",
		Name:      "Supabase",
		Summary:   i18n.T("module.tool.supabase.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 0, DiskMB: 128},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key:      "access_token",
				Kind:     contract.FieldSecret,
				Label:    i18n.T("module.tool.supabase.access_token.label"),
				Required: true,
				Managed:  true,
			},
		},
		Connection: contract.ConnectionSupabase,
		Runs:       false,
		Mandatory:  false,
		Since:      "0.2.0",
	}
}
