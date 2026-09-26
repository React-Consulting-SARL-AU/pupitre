package browser

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const (
	ID           = "ai.browser"
	SubdomainKey = "subdomain"

	subdomainPattern = `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`
)

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "ai",
		Name:      i18n.T("module.ai.browser.name"),
		Summary:   i18n.T("module.ai.browser.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 512, DiskMB: 1024},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{
				Key:       SubdomainKey,
				Kind:      contract.FieldText,
				Label:     i18n.T("module.ai.browser.subdomain.label"),
				Help:      i18n.T("module.ai.browser.subdomain.help"),
				Pattern:   subdomainPattern,
				MaxLength: 63,
				Required:  false,
			},
		},
		Runs:      true,
		Mandatory: false,
		Since:     "0.1.0",
	}
}
