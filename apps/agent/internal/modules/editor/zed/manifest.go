package zed

import "pupitre.studio/agent/internal/contract"

const ID = "editor.zed"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "editor",
		Name:      "Zed Remote Server",
		Summary:   "Le serveur distant de Zed posé d'avance pour la version que tu utilises ; le projet s'ouvre par un lien zed://ssh, sans rien télécharger à la connexion.",
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 256, DiskMB: 256},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key: "version", Kind: contract.FieldText, Label: "Version",
				Help:     "latest, ou la version exacte de ton Zed (menu Zed, À propos) : le serveur distant doit correspondre au client.",
				Required: false, Default: latest,
			},
		},
		Provides:  []string{"editor:zed"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
