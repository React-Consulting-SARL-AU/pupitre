package hardening

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "core.hardening"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "core",
		Name:      i18n.T("module.core.hardening.name"),
		Summary:   i18n.T("module.core.hardening.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 64, DiskMB: 64},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "ssh_443", Kind: contract.FieldBoolean, Label: i18n.T("module.core.hardening.ssh_443.label"), Help: i18n.T("module.core.hardening.ssh_443.help"), HintText: i18n.T("module.core.hardening.ssh_443.hint"), Required: false, Default: false},
			{Key: "keep_root", Kind: contract.FieldBoolean, Label: i18n.T("module.core.hardening.keep_root.label"), Help: i18n.T("module.core.hardening.keep_root.help"), HintText: i18n.T("module.core.hardening.keep_root.hint"), Required: false, Default: false},
		},
		Runs:      false,
		Mandatory: true,
		Since:     "0.1.0",
	}
}
