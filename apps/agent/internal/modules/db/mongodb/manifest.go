package mongodb

import "pupitre.studio/agent/internal/contract"

const ID = "db.mongodb"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "database",
		Name:      "MongoDB 8",
		Summary:   "MongoDB 8 lié à 127.0.0.1, authentification active, un utilisateur applicatif et les archives mongodump de ~/dumps importées.",
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 1024, DiskMB: 2048},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "app_password", Kind: contract.FieldSecret, Label: "Mot de passe de l'utilisateur applicatif", Help: "Celui que tes applications et ton poste utilisent, à travers le tunnel SSH.", Required: true, Generate: true},
		},
		Provides:  []string{"db:mongodb"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
