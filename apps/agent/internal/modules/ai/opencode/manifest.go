package opencode

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "ai.opencode"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "ai",
		Name:      "OpenCode",
		Summary:   i18n.T("module.ai.opencode.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 512, DiskMB: 256},
		Arch:      []string{"amd64", "arm64"},
		Fields:    []contract.Field{},
		Runs:      true,
		Mandatory: false,
		Since:     "0.2.0",
	}
}
