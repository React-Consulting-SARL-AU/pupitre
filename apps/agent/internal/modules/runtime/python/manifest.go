package python

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules/runtime/mise"
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
			mise.Python.Field(i18n.T("module.runtime.python.python_versions.label"), i18n.T("module.runtime.python.python_versions.help")),
		},
		Runs:      false,
		Mandatory: false,
		Since:     "0.1.0",
	}
}
