package vscode

import "pupitre.studio/agent/internal/contract"

const ID = "editor.vscode"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:       ID,
		Category: "editor",
		Name:     "VS Code Remote SSH",
		// Cursor and Windsurf are VS Code forks: they lay their own server the same way, and this module prepares the machine for all three.
		Summary:   "La commande code et le serveur distant posés d'avance : la première connexion Remote SSH n'installe plus rien, extensions comprises. Vaut aussi pour Cursor et Windsurf, qui posent leur propre serveur par le même mécanisme.",
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 512, DiskMB: 1024},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key: "extensions", Kind: contract.FieldList, Label: "Extensions",
				Help:     "Un identifiant par ligne, comme esbenp.prettier-vscode ; vide, aucune extension n'est posée.",
				Required: false, Items: contract.ItemsText, Max: 32,
			},
			{
				Key: "tunnel", Kind: contract.FieldBoolean, Label: "Remote Tunnel",
				Help:     "Un service garde le tunnel VS Code ouvert ; il demande une authentification une fois posé.",
				Required: false, Default: false,
			},
		},
		Provides:  []string{"editor:vscode"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
