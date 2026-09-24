package contract

type ErrorCode string

const (
	ErrorHelloRequired       ErrorCode = "hello_required"
	ErrorProtocolMismatch    ErrorCode = "protocol_mismatch"
	ErrorBadRequest          ErrorCode = "bad_request"
	ErrorInvalidConfig       ErrorCode = "invalid_config"
	ErrorUnknownCommand      ErrorCode = "unknown_command"
	ErrorEntitlementRequired ErrorCode = "entitlement_required"
	ErrorProjectNotFound     ErrorCode = "project_not_found"
	ErrorModuleNotFound      ErrorCode = "module_not_found"
	ErrorNoReport            ErrorCode = "no_report"
	ErrorServiceNotFound     ErrorCode = "service_not_found"
	ErrorBadSignature        ErrorCode = "bad_signature"
	ErrorDowngradeRefused    ErrorCode = "downgrade_refused"
	ErrorMigrationRequired   ErrorCode = "migration_required"
	ErrorBusy                ErrorCode = "busy"
	ErrorStorageRefused      ErrorCode = "storage_refused"
	ErrorBackupMissing       ErrorCode = "backup_missing"
	ErrorBackupUnsupported   ErrorCode = "backup_unsupported"
	ErrorBackupCorrupt       ErrorCode = "backup_corrupt"
	ErrorInternal            ErrorCode = "internal"
)

var ErrorCodes = []ErrorCode{
	ErrorHelloRequired,
	ErrorProtocolMismatch,
	ErrorBadRequest,
	ErrorInvalidConfig,
	ErrorUnknownCommand,
	ErrorEntitlementRequired,
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
	ErrorInternal,
}

type Entitlement string

const (
	EntitlementValid      Entitlement = "valid"
	EntitlementGrace      Entitlement = "grace"
	EntitlementRestricted Entitlement = "restricted"
	EntitlementDev        Entitlement = "dev"
)

var Entitlements = []Entitlement{
	EntitlementValid,
	EntitlementGrace,
	EntitlementRestricted,
	EntitlementDev,
}
