package node

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "runtime.node"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "runtime",
		Name:      "Node.js",
		Summary:   i18n.T("module.runtime.node.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 256, DiskMB: 1536},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "node_version", Kind: contract.FieldVersion, Label: i18n.T("module.runtime.node.node_version.label"), Options: []string{"24", "22", "20"}, Default: "22"},
			{Key: "bun", Kind: contract.FieldBoolean, Label: i18n.T("module.runtime.node.bun.label"), Help: i18n.T("module.runtime.node.bun.help"), Required: false, Default: true},
			{Key: "pnpm", Kind: contract.FieldBoolean, Label: i18n.T("module.runtime.node.pnpm.label"), Help: i18n.T("module.runtime.node.pnpm.help"), Required: false, Default: true},
		},
		Provides:  []string{"runtime:node"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
