package ruby

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules/runtime/mise"
)

const ID = "runtime.ruby"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "runtime",
		Name:      "Ruby",
		Summary:   i18n.T("module.runtime.ruby.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 512, DiskMB: 1536},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			mise.Ruby.Field(i18n.T("module.runtime.ruby.ruby_versions.label"), i18n.T("module.runtime.ruby.ruby_versions.help")),
			{Key: "bundler", Kind: contract.FieldBoolean, Label: i18n.T("module.runtime.ruby.bundler.label"), Help: i18n.T("module.runtime.ruby.bundler.help"), Required: false, Default: true},
		},
		Runs:      false,
		Mandatory: false,
		Since:     "0.3.0",
	}
}
