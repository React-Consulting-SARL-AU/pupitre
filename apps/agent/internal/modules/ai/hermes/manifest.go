package hermes

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "ai.hermes"

// One entry is "<vendor>:<key>": the vendor names the environment variable, the rest is the secret.
const providerShape = `^[A-Za-z0-9 ._-]+:.+$`

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "ai",
		Name:      "Hermes Agent",
		Summary:   i18n.T("module.ai.hermes.summary"),
		Requires:  []string{"core.system", "runtime.python"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 512, DiskMB: 1024},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key: "providers", Kind: contract.FieldList, Label: i18n.T("module.ai.hermes.providers.label"),
				Help:     i18n.T("module.ai.hermes.providers.help"),
				HintText: i18n.T("module.ai.hermes.providers.hint"),
				Required: true, Items: contract.ItemsSecret, Min: 1, Max: 8,
				Pattern: providerShape,
			},
			{Key: "always_on", Kind: contract.FieldBoolean, Label: i18n.T("module.ai.hermes.always_on.label"), Help: i18n.T("module.ai.hermes.always_on.help"), Required: false, Default: false},
		},
		Runs:      true,
		Mandatory: false,
		Since:     "0.1.0",
	}
}
