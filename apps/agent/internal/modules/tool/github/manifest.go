package github

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "tool.github"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "tool",
		Name:      "GitHub",
		Summary:   i18n.T("module.tool.github.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 64, DiskMB: 128},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key:      "token",
				Kind:     contract.FieldSecret,
				Label:    i18n.T("module.tool.github.token.label"),
				Help:     i18n.T("module.tool.github.token.help"),
				HintText: i18n.T("module.tool.github.token.hint"),
				HintURL:  "https://github.com/settings/personal-access-tokens/new",
				Required: true,
			},
		},
		Provides:  []string{"tool:gh", "git:github"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
