package hardening

import "pupitre.studio/agent/internal/contract"

const ID = "core.hardening"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "core",
		Name:      "Durcissement",
		Summary:   "Pare-feu ufw sur SSH seul, fail2ban, puis fermeture de root et des mots de passe une fois qu'une clé ouvre dev.",
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 64, DiskMB: 64},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "ssh_443", Kind: contract.FieldBoolean, Label: "SSH aussi sur le port 443", Help: "Pour les réseaux qui filtrent le port 22.", Required: false, Default: false},
		},
		Provides:  []string{"firewall:ufw"},
		Mandatory: true,
		Since:     "0.1.0",
	}
}
