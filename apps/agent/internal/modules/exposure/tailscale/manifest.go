package tailscale

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "exposure.tailscale"

// The auth key is typed, not managed: it is minted per machine in the tailnet console and opens no API from the laptop.
func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "exposure",
		Name:      "Tailscale",
		Summary:   i18n.T("module.exposure.tailscale.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 64, DiskMB: 128},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key:      "auth_key",
				Kind:     contract.FieldSecret,
				Label:    i18n.T("module.exposure.tailscale.auth_key.label"),
				Help:     i18n.T("module.exposure.tailscale.auth_key.help"),
				HintText: i18n.T("module.exposure.tailscale.auth_key.hint"),
				HintURL:  "https://login.tailscale.com/admin/settings/keys",
				Required: true,
			},
			{
				Key:      "hostname",
				Kind:     contract.FieldText,
				Label:    i18n.T("module.exposure.tailscale.hostname.label"),
				Help:     i18n.T("module.exposure.tailscale.hostname.help"),
				Format:   contract.FormatHostname,
				Required: false,
			},
			{
				Key:      "ssh",
				Kind:     contract.FieldBoolean,
				Label:    i18n.T("module.exposure.tailscale.ssh.label"),
				Help:     i18n.T("module.exposure.tailscale.ssh.help"),
				Required: false,
				Default:  false,
			},
		},
		Runs:      true,
		Mandatory: false,
		Since:     "0.2.0",
	}
}
