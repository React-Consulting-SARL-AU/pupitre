package jetbrains

import "pupitre.studio/agent/internal/contract"

const ID = "editor.jetbrains"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "editor",
		Name:      "JetBrains Remote Dev",
		Summary:   "Le backend de développement distant posé d'avance là où JetBrains Gateway le cherche, JVM taillée pour la mémoire de la machine ; la licence reste la tienne, rien à activer ici.",
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 2048, DiskMB: 6144},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key: "ide", Kind: contract.FieldSelect, Label: "IDE",
				Help:     "Celui que tu ouvres depuis Gateway ; un backend par IDE.",
				Required: true, Default: "idea",
				Options: []string{"idea", "webstorm", "pycharm", "phpstorm", "goland"},
			},
			{
				Key: "version", Kind: contract.FieldText, Label: "Version",
				Help:     "latest, ou une version majeure comme 2026.2 ; le backend doit rester compatible avec ton Gateway.",
				Required: false, Default: latest,
			},
		},
		Provides:  []string{"editor:jetbrains"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
