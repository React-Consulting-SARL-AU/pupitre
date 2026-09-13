package cursor

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "ai.cursor"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "ai",
		Name:      "Cursor CLI",
		Summary:   i18n.T("module.ai.cursor.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 512, DiskMB: 768},
		Arch:      []string{"amd64", "arm64"},
		Fields:    []contract.Field{},
		Runs:      true,
		Mandatory: false,
		Since:     "0.2.0",
	}
}
