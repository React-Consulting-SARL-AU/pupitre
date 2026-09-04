package github

import "pupitre.studio/agent/internal/contract"

const ID = "tool.github"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "tool",
		Name:      "GitHub",
		Summary:   "La commande gh, le clone HTTPS sans clé grâce au jeton, et la clé publique du serveur enregistrée sur le compte.",
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 64, DiskMB: 128},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "token", Kind: contract.FieldSecret, Label: "Jeton d'accès", Help: "Un jeton avec les droits repo, read:org et admin:public_key pour enregistrer la clé du serveur.", Required: true},
		},
		Provides:  []string{"tool:gh", "git:github"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
