package caddy

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "exposure.caddy"

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "exposure",
		Name:      "Caddy",
		Summary:   i18n.T("module.exposure.caddy.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{"exposure.cloudflare"},
		Resources: contract.Resources{RAMMB: 128, DiskMB: 128},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key:      "domain",
				Kind:     contract.FieldText,
				Label:    i18n.T("module.exposure.caddy.domain.label"),
				Help:     i18n.T("module.exposure.caddy.domain.help"),
				HintText: i18n.T("module.exposure.caddy.domain.hint"),
				Format:   contract.FormatDomain,
				Required: true,
			},
			{
				Key:      "email",
				Kind:     contract.FieldText,
				Label:    i18n.T("module.exposure.caddy.email.label"),
				Help:     i18n.T("module.exposure.caddy.email.help"),
				HintText: i18n.T("module.exposure.caddy.email.hint"),
				Format:   contract.FormatEmail,
				Required: true,
			},
			{Key: "http_port", Kind: contract.FieldNumber, Label: i18n.T("module.exposure.caddy.http_port.label"), Help: i18n.T("module.exposure.caddy.http_port.help"), Format: contract.FormatPort, Required: true, Default: DefaultHTTPPort, Min: 1, Max: 65535},
			{Key: "https_port", Kind: contract.FieldNumber, Label: i18n.T("module.exposure.caddy.https_port.label"), Help: i18n.T("module.exposure.caddy.https_port.help"), Format: contract.FormatPort, Required: true, Default: DefaultHTTPSPort, Min: 1, Max: 65535},
		},
		Runs:      true,
		Mandatory: false,
		Since:     "0.3.0",
	}
}
