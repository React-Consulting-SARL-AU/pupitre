package cloudflare

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "exposure.cloudflare"

// Both are written into cloudflared's YAML as they are: an account is 32 hex digits, a tunnel a UUID, and nothing else may pass.
const (
	AccountTagPattern = "^[0-9a-fA-F]{32}$"
	TunnelIDPattern   = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)

// Three of the four are derived by the app from the client's Cloudflare account, which never comes down here; the domain is the client's own choice, one per server.
func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "exposure",
		Name:      "Cloudflare Tunnel",
		Summary:   i18n.T("module.exposure.cloudflare.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{"exposure.caddy"},
		Resources: contract.Resources{RAMMB: 128, DiskMB: 128},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key:      "domain",
				Kind:     contract.FieldText,
				Label:    i18n.T("module.exposure.cloudflare.domain.label"),
				Help:     i18n.T("module.exposure.cloudflare.domain.help"),
				HintText: i18n.T("module.exposure.cloudflare.domain.hint"),
				HintURL:  "https://dash.cloudflare.com/?to=/:account/:zone/dns",
				Format:   contract.FormatDomain,
				Required: true,
			},
			{Key: "account_tag", Kind: contract.FieldText, Label: i18n.T("module.exposure.cloudflare.account_tag.label"), Pattern: AccountTagPattern, Required: true, Managed: true},
			{Key: "tunnel_id", Kind: contract.FieldText, Label: i18n.T("module.exposure.cloudflare.tunnel_id.label"), Pattern: TunnelIDPattern, Required: true, Managed: true},
			{Key: "tunnel_secret", Kind: contract.FieldSecret, Label: i18n.T("module.exposure.cloudflare.tunnel_secret.label"), Required: true, Managed: true},
		},
		Connection: contract.ConnectionCloudflare,
		Runs:       true,
		Mandatory:  false,
		Since:      "0.1.0",
	}
}
