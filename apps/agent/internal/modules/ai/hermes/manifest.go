package hermes

import "pupitre.studio/agent/internal/contract"

const ID = "ai.hermes"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "ai",
		Name:      "Hermes Agent",
		Summary:   "L'agent Hermes de Nous Research, posé par Python, avec les fournisseurs de modèles de ton choix et, si tu le veux, un service qui le garde en marche.",
		Requires:  []string{"core.system", "runtime.python"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 512, DiskMB: 1024},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key: "providers", Kind: contract.FieldList, Label: "Fournisseurs de modèles",
				Help:     "Une entrée par fournisseur, sous la forme fournisseur:clé, par exemple openai:sk-…",
				Required: true, Items: contract.ItemsSecret, Min: 1, Max: 8,
			},
			{Key: "always_on", Kind: contract.FieldBoolean, Label: "Toujours actif", Help: "Un service systemd garde Hermes en marche entre deux sessions.", Required: false, Default: false},
		},
		Provides:  []string{"agent:hermes"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
