package contract

type ErrorCode string

const (
	ErrorHelloRequired     ErrorCode = "hello_required"
	ErrorProtocolMismatch  ErrorCode = "protocol_mismatch"
	ErrorBadRequest        ErrorCode = "bad_request"
	ErrorInvalidConfig     ErrorCode = "invalid_config"
	ErrorUnknownCommand    ErrorCode = "unknown_command"
	ErrorLicenseRequired   ErrorCode = "license_required"
	ErrorProjectNotFound   ErrorCode = "project_not_found"
	ErrorModuleNotFound    ErrorCode = "module_not_found"
	ErrorNoReport          ErrorCode = "no_report"
	ErrorServiceNotFound   ErrorCode = "service_not_found"
	ErrorBadSignature      ErrorCode = "bad_signature"
	ErrorDowngradeRefused  ErrorCode = "downgrade_refused"
	ErrorMigrationRequired ErrorCode = "migration_required"
	ErrorBusy              ErrorCode = "busy"
	ErrorStorageRefused    ErrorCode = "storage_refused"
	ErrorBackupMissing     ErrorCode = "backup_missing"
	ErrorBackupUnsupported ErrorCode = "backup_unsupported"
	ErrorBackupCorrupt     ErrorCode = "backup_corrupt"
	ErrorPrivilegeRequired ErrorCode = "privilege_required"
	ErrorInternal          ErrorCode = "internal"
)

var ErrorCodes = []ErrorCode{
	ErrorHelloRequired,
	ErrorProtocolMismatch,
	ErrorBadRequest,
	ErrorInvalidConfig,
	ErrorUnknownCommand,
	ErrorLicenseRequired,
	ErrorProjectNotFound,
	ErrorModuleNotFound,
	ErrorNoReport,
	ErrorServiceNotFound,
	ErrorBadSignature,
	ErrorDowngradeRefused,
	ErrorMigrationRequired,
	ErrorBusy,
	ErrorStorageRefused,
	ErrorBackupMissing,
	ErrorBackupUnsupported,
	ErrorBackupCorrupt,
	ErrorPrivilegeRequired,
	ErrorInternal,
}

type License string

const (
	LicenseValid      License = "valid"
	LicenseGrace      License = "grace"
	LicenseRestricted License = "restricted"
	LicenseDev        License = "dev"
)

var Licenses = []License{
	LicenseValid,
	LicenseGrace,
	LicenseRestricted,
	LicenseDev,
}
