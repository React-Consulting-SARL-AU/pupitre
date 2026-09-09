package ssh

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "exposure.ssh"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "exposure",
		Name:      i18n.T("module.exposure.ssh.name"),
		Summary:   i18n.T("module.exposure.ssh.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{"exposure.cloudflare", "exposure.caddy"},
		Resources: contract.Resources{RAMMB: 0, DiskMB: 0},
		Arch:      []string{"amd64", "arm64"},
		Fields:    []contract.Field{},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
