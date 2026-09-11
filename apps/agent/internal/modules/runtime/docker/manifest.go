package docker

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "runtime.docker"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "runtime",
		Name:      "Docker",
		Summary:   i18n.T("module.runtime.docker.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 512, DiskMB: 4096},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "compose", Kind: contract.FieldBoolean, Label: i18n.T("module.runtime.docker.compose.label"), Help: i18n.T("module.runtime.docker.compose.help"), Required: false, Default: true},
			{Key: "data_root", Kind: contract.FieldText, Label: i18n.T("module.runtime.docker.data_root.label"), Help: i18n.T("module.runtime.docker.data_root.help"), HintText: i18n.T("module.runtime.docker.data_root.hint"), Format: contract.FormatPath, Required: false},
			{Key: "log_max_size", Kind: contract.FieldText, Label: i18n.T("module.runtime.docker.log_max_size.label"), Help: i18n.T("module.runtime.docker.log_max_size.help"), Format: contract.FormatSize, Required: false},
		},
		Runs:      true,
		Mandatory: false,
		Since:     "0.3.0",
	}
}
