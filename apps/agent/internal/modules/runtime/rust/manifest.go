package rust

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "runtime.rust"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "runtime",
		Name:      "Rust",
		Summary:   i18n.T("module.runtime.rust.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 512, DiskMB: 2048},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "rust_version", Kind: contract.FieldVersion, Label: i18n.T("module.runtime.rust.rust_version.label"), Options: []string{"1.98", "1.97", "1.96"}, Default: "1.98"},
		},
		Runs:      false,
		Mandatory: false,
		Since:     "0.2.0",
	}
}
