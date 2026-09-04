package postgres

import "pupitre.studio/agent/internal/contract"

const ID = "db.postgres"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "database",
		Name:      "PostgreSQL 17",
		Summary:   "PostgreSQL 17 lié à 127.0.0.1, un rôle pour les applications, un pour ton poste à travers SSH, les extensions courantes et les dumps de ~/dumps importés.",
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 1024, DiskMB: 2048},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "app_password", Kind: contract.FieldSecret, Label: "Mot de passe du rôle applicatif", Required: true, Generate: true},
			{Key: "remote_password", Kind: contract.FieldSecret, Label: "Mot de passe du rôle distant", Help: "Celui que ton poste utilise à travers le tunnel SSH.", Required: true, Generate: true},
		},
		Provides:  []string{"db:postgres"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
