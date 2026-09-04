package browser

import "pupitre.studio/agent/internal/contract"

const ID = "ai.browser"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "ai",
		Name:      "Navigateur et galerie",
		Summary:   "Chrome sans interface et les bibliothèques dont Playwright a besoin, la commande shot qui range ses captures dans ~/shots, et la galerie qui les sert en local.",
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 512, DiskMB: 1024},
		Arch:      []string{"amd64", "arm64"},
		Fields:    []contract.Field{},
		Provides:  []string{"tool:shot", "gallery"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
