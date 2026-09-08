package codex

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "ai.codex"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "ai",
		Name:      "Codex",
		Summary:   i18n.T("module.ai.codex.summary"),
		Requires:  []string{"core.system", "runtime.node"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 512, DiskMB: 512},
		Arch:      []string{"amd64", "arm64"},
		Fields:    []contract.Field{},
		Provides:  []string{"agent:codex"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
