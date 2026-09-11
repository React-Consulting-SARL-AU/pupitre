package jetbrains

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "editor.jetbrains"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "editor",
		Name:      "JetBrains Remote Dev",
		Summary:   i18n.T("module.editor.jetbrains.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 2048, DiskMB: 6144},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key: "ide", Kind: contract.FieldSelect, Label: i18n.T("module.editor.jetbrains.ide.label"),
				Help:     i18n.T("module.editor.jetbrains.ide.help"),
				Required: true, Default: "idea",
				Options: []string{"idea", "webstorm", "pycharm", "phpstorm", "goland"},
			},
			{
				Key: "version", Kind: contract.FieldText, Label: i18n.T("module.editor.jetbrains.version.label"),
				Help:     i18n.T("module.editor.jetbrains.version.help"),
				HintText: i18n.T("module.editor.jetbrains.version.hint"),
				Pattern:  contract.PatternVersionOrLatest,
				Required: false, Default: latest,
			},
		},
		Runs:      true,
		Mandatory: false,
		Since:     "0.1.0",
	}
}
