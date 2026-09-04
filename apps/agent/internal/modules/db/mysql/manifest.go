package mysql

import "pupitre.studio/agent/internal/contract"

const ID = "db.mysql"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "database",
		Name:      "MySQL 8 ou MariaDB",
		Summary:   "Le moteur choisi, lié à 127.0.0.1, root sur socket, un compte pour les applications, un pour ton poste à travers SSH, et les dumps de ~/dumps importés.",
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 1024, DiskMB: 2048},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "engine", Kind: contract.FieldSelect, Label: "Moteur", Help: "MariaDB reste compatible avec la plupart des clients MySQL.", Required: true, Default: mysqlEngine, Options: []string{mysqlEngine, mariadbEngine}},
			{Key: "app_password", Kind: contract.FieldSecret, Label: "Mot de passe du compte applicatif", Required: true, Generate: true},
			{Key: "remote_password", Kind: contract.FieldSecret, Label: "Mot de passe du compte distant", Help: "Celui que ton poste utilise à travers le tunnel SSH.", Required: true, Generate: true},
			{Key: "buffer_pool", Kind: contract.FieldText, Label: "Buffer pool InnoDB", Help: "Vide : un quart de la mémoire de la machine. Sinon une taille MySQL, par exemple 2G.", Required: false},
		},
		Provides:  []string{"db:mysql"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
