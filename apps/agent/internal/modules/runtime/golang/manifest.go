package golang

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "runtime.go"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "runtime",
		Name:      "Go",
		Summary:   i18n.T("module.runtime.go.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 256, DiskMB: 1024},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "go_version", Kind: contract.FieldVersion, Label: i18n.T("module.runtime.go.go_version.label"), Options: []string{"1.25", "1.24", "1.23"}, Default: "1.25"},
			{Key: "gopath", Kind: contract.FieldText, Label: i18n.T("module.runtime.go.gopath.label"), Help: i18n.T("module.runtime.go.gopath.help"), Format: contract.FormatPath, Required: false},
		},
		Runs:      false,
		Mandatory: false,
		Since:     "0.3.0",
	}
}
