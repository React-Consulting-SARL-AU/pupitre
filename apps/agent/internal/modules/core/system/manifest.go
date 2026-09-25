package system

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "core.system"

// Written quoted into .gitconfig, where a control character would end the value and start a new line.
const GitNamePattern = `^[^\x00-\x1f\x7f]+$`

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "core",
		Name:      i18n.T("module.core.system.name"),
		Summary:   i18n.T("module.core.system.summary"),
		Requires:  []string{},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 256, DiskMB: 1024},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "timezone", Kind: contract.FieldText, Label: i18n.T("module.core.system.timezone.label"), Help: i18n.T("module.core.system.timezone.help"), HintText: i18n.T("module.core.system.timezone.hint"), Format: contract.FormatTimezone, Required: true, Default: "Etc/UTC"},
			{Key: "git_name", Kind: contract.FieldText, Label: i18n.T("module.core.system.git_name.label"), Help: i18n.T("module.core.system.git_name.help"), Pattern: GitNamePattern, Required: true, MinLength: 2, MaxLength: 64},
			{Key: "git_email", Kind: contract.FieldText, Label: i18n.T("module.core.system.git_email.label"), Help: i18n.T("module.core.system.git_email.help"), Format: contract.FormatEmail, Required: true},
			{Key: "projects_dir", Kind: contract.FieldText, Label: i18n.T("module.core.system.projects_dir.label"), Help: i18n.T("module.core.system.projects_dir.help"), HintText: i18n.T("module.core.system.projects_dir.hint"), Format: contract.FormatPath, Required: true, Default: ProjectsDir},
		},
		Runs:      false,
		Mandatory: true,
		Since:     "0.1.0",
	}
}
