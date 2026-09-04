package java

import "pupitre.studio/agent/internal/contract"

const ID = "runtime.java"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "runtime",
		Name:      "Java (Temurin)",
		Summary:   "Temurin par mise, JAVA_HOME pour tous les shells et daemon Gradle dimensionné d'après la mémoire de la machine.",
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 1024, DiskMB: 1024},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "java_version", Kind: contract.FieldVersion, Label: "Version de Java", Options: []string{"25", "21", "17"}, Default: "21"},
		},
		Provides:  []string{"runtime:java"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
