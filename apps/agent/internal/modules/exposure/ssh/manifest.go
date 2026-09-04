package ssh

import "pupitre.studio/agent/internal/contract"

const ID = "exposure.ssh"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "exposure",
		Name:      "Accès par SSH",
		Summary:   "Sans exposition publique : chaque projet reste sur son port, et l'app y accède par la session SSH qu'elle tient déjà.",
		Requires:  []string{"core.system"},
		Conflicts: []string{"exposure.cloudflare"},
		Resources: contract.Resources{RAMMB: 0, DiskMB: 0},
		Arch:      []string{"amd64", "arm64"},
		Fields:    []contract.Field{},
		Provides:  []string{"exposure:ssh"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
