package codex

import "pupitre.studio/agent/internal/contract"

const ID = "ai.codex"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "ai",
		Name:      "Codex",
		Summary:   "Codex installé pour dev, avec le contexte de la machine et les skills Pupitre. La connexion passe par l'URL affichée au premier lancement et l'abonnement du client.",
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
