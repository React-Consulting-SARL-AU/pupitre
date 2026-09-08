package python

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "runtime.python"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "runtime",
		Name:      "Python (uv)",
		Summary:   i18n.T("module.runtime.python.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 256, DiskMB: 1024},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "python_version", Kind: contract.FieldVersion, Label: i18n.T("module.runtime.python.python_version.label"), Options: []string{"3.13", "3.12", "3.11"}, Default: "3.12"},
		},
		Provides:  []string{"runtime:python"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
