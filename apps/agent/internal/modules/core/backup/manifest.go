package backup

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const ID = "core.backup"

const (
	DefaultRegion   = "auto"
	DefaultPrefix   = "pupitre"
	DefaultInterval = 24
	DefaultHour     = 3
	DefaultKeep     = 14
	MaxInterval     = 720
	MaxKeep         = 365
	lastHour        = 23
	maxExtraPaths   = 32

	ProjectsFull = contract.BackupProjectsFull
	ProjectsEnv  = contract.BackupProjectsEnv
	ProjectsNone = contract.BackupProjectsNone

	// A prefix is one or more path segments, never a slash at either end.
	prefixPattern    = `^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$`
	recipientPattern = `^[A-Za-z0-9+/]{43}=$`
	saltPattern      = `^[A-Za-z0-9+/]{22}==$`
	// A number field with no lower bound would take a negative; the pattern is what keeps it at zero or above.
	naturalPattern = `^[0-9]+$`
)

func manifest() contract.Manifest {
	return contract.Manifest{
		ID:        ID,
		Category:  "core",
		Name:      i18n.T("module.core.backup.name"),
		Summary:   i18n.T("module.core.backup.summary"),
		Requires:  []string{"core.system"},
		Conflicts: []string{},
		Resources: contract.Resources{RAMMB: 64, DiskMB: 0},
		Arch:      []string{"amd64", "arm64"},
		Fields: []contract.Field{
			{Key: "endpoint", Kind: contract.FieldText, Label: i18n.T("module.core.backup.endpoint.label"), Format: contract.FormatURL, Pattern: contract.Backup.EndpointPattern, Required: true, Managed: true},
			{Key: "region", Kind: contract.FieldText, Label: i18n.T("module.core.backup.region.label"), Pattern: contract.Backup.RegionPattern, Required: true, Default: DefaultRegion, MaxLength: 64, Managed: true},
			{Key: "bucket", Kind: contract.FieldText, Label: i18n.T("module.core.backup.bucket.label"), Pattern: contract.Backup.BucketPattern, Required: true, MinLength: 3, MaxLength: 63, Managed: true},
			{Key: "prefix", Kind: contract.FieldText, Label: i18n.T("module.core.backup.prefix.label"), Pattern: prefixPattern, Required: true, Default: DefaultPrefix, MaxLength: 200, Managed: true},
			{Key: "path_style", Kind: contract.FieldBoolean, Label: i18n.T("module.core.backup.path_style.label"), Required: false, Default: true, Managed: true},
			{Key: "access_key_id", Kind: contract.FieldText, Label: i18n.T("module.core.backup.access_key_id.label"), Required: true, Managed: true},
			{Key: "secret_access_key", Kind: contract.FieldSecret, Label: i18n.T("module.core.backup.secret_access_key.label"), Required: true, Managed: true},
			{Key: "recipient", Kind: contract.FieldText, Label: i18n.T("module.core.backup.recipient.label"), Pattern: recipientPattern, Required: true, Managed: true},
			{Key: "kdf_salt", Kind: contract.FieldText, Label: i18n.T("module.core.backup.kdf_salt.label"), Pattern: saltPattern, Required: true, Managed: true},
			{Key: "interval_hours", Kind: contract.FieldNumber, Label: i18n.T("module.core.backup.interval_hours.label"), Help: i18n.T("module.core.backup.interval_hours.help"), Pattern: naturalPattern, Required: true, Default: DefaultInterval, Max: MaxInterval},
			{Key: "hour", Kind: contract.FieldNumber, Label: i18n.T("module.core.backup.hour.label"), Help: i18n.T("module.core.backup.hour.help"), Pattern: naturalPattern, Required: true, Default: DefaultHour, Max: lastHour},
			{Key: "keep", Kind: contract.FieldNumber, Label: i18n.T("module.core.backup.keep.label"), Help: i18n.T("module.core.backup.keep.help"), Required: true, Default: DefaultKeep, Min: 1, Max: MaxKeep},
			{Key: "databases", Kind: contract.FieldBoolean, Label: i18n.T("module.core.backup.databases.label"), Required: false, Default: true},
			{Key: "home", Kind: contract.FieldBoolean, Label: i18n.T("module.core.backup.home.label"), Help: i18n.T("module.core.backup.home.help"), Required: false, Default: true},
			{Key: "projects", Kind: contract.FieldBoolean, Label: i18n.T("module.core.backup.projects.label"), Required: false, Default: true},
			{Key: "projects_env_only", Kind: contract.FieldBoolean, Label: i18n.T("module.core.backup.projects_env_only.label"), Help: i18n.T("module.core.backup.projects_env_only.help"), Required: false, Default: false},
			{Key: "extra_paths", Kind: contract.FieldList, Label: i18n.T("module.core.backup.extra_paths.label"), Help: i18n.T("module.core.backup.extra_paths.help"), Required: false, Items: contract.ItemsText, Pattern: contract.Backup.ExtraPathPattern, Max: maxExtraPaths},
			{Key: "exclude_projects", Kind: contract.FieldList, Label: i18n.T("module.core.backup.exclude_projects.label"), Help: i18n.T("module.core.backup.exclude_projects.help"), Required: false, Items: contract.ItemsText, Pattern: contract.Backup.ProjectItem},
			{Key: "exclude_databases", Kind: contract.FieldList, Label: i18n.T("module.core.backup.exclude_databases.label"), Help: i18n.T("module.core.backup.exclude_databases.help"), Required: false, Items: contract.ItemsText, Pattern: contract.Backup.DatabaseItem},
		},
		Connection: contract.ConnectionBackup,
		Runs:       false,
		Mandatory:  false,
		Since:      "0.8.0",
	}
}
