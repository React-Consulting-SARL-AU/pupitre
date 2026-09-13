package openclaw

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules/ai/providers"
)

const ID = "ai.openclaw"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "ai",
		Name:      "OpenClaw",
		Summary:   i18n.T("module.ai.openclaw.summary"),
		Requires:  []string{"core.system", "runtime.node"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 512, DiskMB: 1024},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key: "providers", Kind: contract.FieldList, Label: i18n.T("module.ai.openclaw.providers.label"),
				Help:     i18n.T("module.ai.openclaw.providers.help"),
				HintText: i18n.T("module.ai.openclaw.providers.hint"),
				Required: true, Items: contract.ItemsSecret, Min: 1, Max: 8,
				Pattern: providers.Shape,
			},
			{Key: "always_on", Kind: contract.FieldBoolean, Label: i18n.T("module.ai.openclaw.always_on.label"), Help: i18n.T("module.ai.openclaw.always_on.help"), Required: false, Default: true},
		},
		Runs:      true,
		Mandatory: false,
		Since:     "0.2.0",
	}
}
