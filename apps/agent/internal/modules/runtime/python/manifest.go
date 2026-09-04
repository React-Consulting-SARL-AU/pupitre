package python

import "pupitre.studio/agent/internal/contract"

const ID = "runtime.python"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "runtime",
		Name:      "Python (uv)",
		Summary:   "uv et un interpréteur Python à la version choisie, tous deux posés par mise et actifs dans tous les shells.",
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 256, DiskMB: 1024},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "python_version", Kind: contract.FieldVersion, Label: "Version de Python", Options: []string{"3.13", "3.12", "3.11"}, Default: "3.12"},
		},
		Provides:  []string{"runtime:python"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
