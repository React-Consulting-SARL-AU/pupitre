package protocol

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/platform"
)

type Error struct {
	Code    contract.ErrorCode `json:"code"`
	Message string             `json:"message"`
	Fix     string             `json:"fix,omitempty"`
	Remedy  *contract.Remedy   `json:"remedy,omitempty"`
}

func NewError(code contract.ErrorCode, message string) *Error {
	return &Error{Code: code, Message: message}
}

func (e *Error) WithFix(fix string) *Error {
	e.Fix = fix

	return e
}

func (e *Error) WithRemedy(remedy *contract.Remedy) *Error {
	e.Remedy = remedy

	return e
}

func (e *Error) Error() string {
	return string(e.Code) + ": " + e.Message
}

func badRequest(message string) *Error {
	return NewError(contract.ErrorBadRequest, message)
}

func secretsFix() string {
	return i18n.T("protocol.secrets.fix")
}

func missingSecrets(cause string) *Error {
	return badRequest(i18n.T("protocol.secrets.missing", cause)).WithFix(secretsFix())
}

func helloRequired() *Error {
	return NewError(contract.ErrorHelloRequired, i18n.T("protocol.hello.required")).
		WithFix(i18n.T("protocol.hello.required.fix"))
}

func unknownCommand(cmd string) *Error {
	return NewError(contract.ErrorUnknownCommand, i18n.T("protocol.command.unknown", cmd))
}

func EntitlementRequired() *Error {
	return NewError(contract.ErrorEntitlementRequired, i18n.T("protocol.entitlement.required")).
		WithFix(i18n.T("protocol.entitlement.required.fix", platform.Console("")))
}

func internalError(cause string) *Error {
	return NewError(contract.ErrorInternal, i18n.T("protocol.internal", cause))
}
