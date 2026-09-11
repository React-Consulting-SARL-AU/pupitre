package zed

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "editor.zed"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "editor",
		Name:      "Zed Remote Server",
		Summary:   i18n.T("module.editor.zed.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 256, DiskMB: 256},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key: "version", Kind: contract.FieldText, Label: i18n.T("module.editor.zed.version.label"),
				Help:     i18n.T("module.editor.zed.version.help"),
				HintText: i18n.T("module.editor.zed.version.hint"),
				Pattern:  contract.PatternVersionOrLatest,
				Required: false, Default: latest,
			},
		},
		Runs:      true,
		Mandatory: false,
		Since:     "0.1.0",
	}
}
