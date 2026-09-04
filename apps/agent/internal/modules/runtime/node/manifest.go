package node

import "pupitre.studio/agent/internal/contract"

const ID = "runtime.node"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "runtime",
		Name:      "Node.js",
		Summary:   "mise, Node à la version choisie, Bun et pnpm en option, actifs dans tous les shells y compris ceux d'une commande ssh.",
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 256, DiskMB: 1536},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "node_version", Kind: contract.FieldVersion, Label: "Version de Node", Options: []string{"24", "22", "20"}, Default: "22"},
			{Key: "bun", Kind: contract.FieldBoolean, Label: "Bun", Help: "Exécution et gestionnaire de paquets JavaScript.", Required: false, Default: true},
			{Key: "pnpm", Kind: contract.FieldBoolean, Label: "pnpm", Help: "Avec corepack, chaque dépôt garde la version qu'il déclare.", Required: false, Default: true},
		},
		Provides:  []string{"runtime:node"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
