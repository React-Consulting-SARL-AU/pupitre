package claude

import "pupitre.studio/agent/internal/contract"

const ID = "ai.claude"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "ai",
		Name:      "Claude Code",
		Summary:   "Claude Code installé pour dev, avec le contexte de la machine et les skills Pupitre. La connexion se fait par l'URL que l'outil affiche au premier lancement.",
		Requires:  []string{"core.system", "runtime.node"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 512, DiskMB: 512},
		Arch:      []string{"amd64", "arm64"},
		Fields:    []contract.Field{},
		Provides:  []string{"agent:claude"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
