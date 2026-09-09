package php

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "runtime.php"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "runtime",
		Name:      "PHP",
		Summary:   i18n.T("module.runtime.php.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 512, DiskMB: 2048},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "php_version", Kind: contract.FieldVersion, Label: i18n.T("module.runtime.php.php_version.label"), Options: []string{"8.4", "8.3", "8.2"}, Default: "8.4"},
			{Key: "composer", Kind: contract.FieldBoolean, Label: i18n.T("module.runtime.php.composer.label"), Help: i18n.T("module.runtime.php.composer.help"), Required: false, Default: true},
			{Key: "memory_limit", Kind: contract.FieldText, Label: i18n.T("module.runtime.php.memory_limit.label"), Help: i18n.T("module.runtime.php.memory_limit.help"), HintText: i18n.T("module.runtime.php.memory_limit.hint"), Format: contract.FormatSize, Required: false},
		},
		Mandatory: false,
		Since:     "0.3.0",
	}
}
