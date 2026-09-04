package onepassword

import "pupitre.studio/agent/internal/contract"

const ID = "tool.1password"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "tool",
		Name:      "1Password",
		Summary:   "La CLI op et un compte de service, pour produire le .env.local d'un projet depuis le gabarit que son dépôt versionne.",
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 64, DiskMB: 128},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "service_account_token", Kind: contract.FieldSecret, Label: "Jeton du compte de service", Help: "Le jeton d'un compte de service qui voit les coffres des projets.", Required: true},
		},
		Provides:  []string{"tool:op", "secrets:1password"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
