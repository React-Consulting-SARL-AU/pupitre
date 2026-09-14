package gemini

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "ai.gemini"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "ai",
		Name:      "Gemini CLI",
		Summary:   i18n.T("module.ai.gemini.summary"),
		Requires:  []string{"core.system", "runtime.node"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 512, DiskMB: 512},
		Arch:      []string{"amd64", "arm64"},
		Fields:    []contract.Field{},
		Runs:      true,
		Mandatory: false,
		Since:     "0.2.0",
	}
}
