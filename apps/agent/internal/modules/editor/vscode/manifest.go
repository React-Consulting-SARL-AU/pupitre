package vscode

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "editor.vscode"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:       ID,
		Category: "editor",
		Name:     "VS Code Remote SSH",
		// Cursor and Windsurf are VS Code forks: they lay their own server the same way, and this module prepares the machine for all three.
		Summary:   i18n.T("module.editor.vscode.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 512, DiskMB: 1024},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key: "extensions", Kind: contract.FieldList, Label: i18n.T("module.editor.vscode.extensions.label"),
				Help:     i18n.T("module.editor.vscode.extensions.help"),
				HintText: i18n.T("module.editor.vscode.extensions.hint"),
				Pattern:  contract.PatternExtensionID,
				Required: false, Items: contract.ItemsText, Max: 32,
			},
			{
				Key: "tunnel", Kind: contract.FieldBoolean, Label: i18n.T("module.editor.vscode.tunnel.label"),
				Help:     i18n.T("module.editor.vscode.tunnel.help"),
				Required: false, Default: false,
			},
		},
		Runs:      true,
		Mandatory: false,
		Since:     "0.1.0",
	}
}
