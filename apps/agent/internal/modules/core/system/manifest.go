package system

import "pupitre.sh/agent/internal/contract"

const ID = "core.system"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "core",
		Name:      "Système",
		Summary:   "Paquets de base, fuseau, mises à jour de sécurité, swap, garde-fou mémoire, utilisateur dev avec sudo, zsh, tmux et identité git.",
		Requires:  []string{},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 256, DiskMB: 1024},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "timezone", Kind: contract.FieldText, Label: "Fuseau horaire", Help: "Nom IANA, par exemple Europe/Paris.", Required: true, Default: "Etc/UTC"},
			{Key: "git_name", Kind: contract.FieldText, Label: "Nom pour git", Required: true},
			{Key: "git_email", Kind: contract.FieldText, Label: "Email pour git", Required: true},
			{Key: "projects_dir", Kind: contract.FieldText, Label: "Dossier des projets", Required: true, Default: ProjectsDir},
		},
		Provides:  []string{"user:dev", "shell:zsh"},
		Mandatory: true,
		Since:     "0.1.0",
	}
}
