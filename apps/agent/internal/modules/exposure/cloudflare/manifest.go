package cloudflare

import "pupitre.studio/agent/internal/contract"

const ID = "exposure.cloudflare"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "exposure",
		Name:      "Cloudflare Tunnel",
		Summary:   "Un tunnel nommé, une route et un enregistrement DNS par projet qui déclare un sous-domaine, le certificat étant géré par Cloudflare.",
		Requires:  []string{"core.system"},
		Conflicts: []string{"exposure.ssh"},
		Resources: contract.Resources{RAMMB: 128, DiskMB: 128},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "api_token", Kind: contract.FieldSecret, Label: "Jeton d'API", Help: "Un jeton de compte avec les droits Cloudflare Tunnel et DNS de la zone.", Required: true},
			{Key: "account_id", Kind: contract.FieldText, Label: "Identifiant de compte", Help: "Le champ Account ID du tableau de bord Cloudflare.", Required: true},
			{Key: "zone_id", Kind: contract.FieldText, Label: "Identifiant de zone", Help: "Le champ Zone ID de la page d'accueil du domaine.", Required: true},
			{Key: "zone_name", Kind: contract.FieldText, Label: "Nom de la zone", Help: "Le domaine tel qu'il apparaît dans Cloudflare, par exemple flymate.dev.", Required: true},
			{Key: "domain", Kind: contract.FieldText, Label: "Domaine des projets", Help: "Le domaine sous lequel les sous-domaines des projets sont créés.", Required: true},
		},
		Provides:  []string{"exposure:cloudflare", "public-url"},
		Mandatory: false,
		Since:     "0.1.0",
	}
}
