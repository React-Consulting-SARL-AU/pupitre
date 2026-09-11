package ruby

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
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
			{Key: "ruby_version", Kind: contract.FieldVersion, Label: i18n.T("module.runtime.ruby.ruby_version.label"), Options: []string{"3.4", "3.3", "3.2"}, Default: "3.4"},
			{Key: "bundler", Kind: contract.FieldBoolean, Label: i18n.T("module.runtime.ruby.bundler.label"), Help: i18n.T("module.runtime.ruby.bundler.help"), Required: false, Default: true},
		},
		Runs:      false,
		Mandatory: false,
		Since:     "0.3.0",
	}
}
