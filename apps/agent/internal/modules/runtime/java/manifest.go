package java

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules/runtime/mise"
)

const ID = "runtime.java"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "runtime",
		Name:      "Java (Temurin)",
		Summary:   i18n.T("module.runtime.java.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 1024, DiskMB: 1024},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			mise.Java.Field(i18n.T("module.runtime.java.java_versions.label"), i18n.T("module.runtime.java.java_versions.help")),
		},
		Runs:      false,
		Mandatory: false,
		Since:     "0.1.0",
	}
}
