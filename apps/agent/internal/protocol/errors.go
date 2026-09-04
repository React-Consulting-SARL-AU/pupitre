package protocol

import "pupitre.studio/agent/internal/contract"

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

const secretsFix = `Écris les secrets en JSON sur une seule ligne de l'entrée standard, juste après la requête : {"<clé>":"<valeur>"}.`

func missingSecrets(cause string) *Error {
	return badRequest("ligne de secrets absente : " + cause).WithFix(secretsFix)
}

func helloRequired() *Error {
	return NewError(contract.ErrorHelloRequired, "hello attendu avant toute commande").
		WithFix("Envoie hello {app_version, protocol} en premier.")
}

func unknownCommand(cmd string) *Error {
	return NewError(contract.ErrorUnknownCommand, "commande inconnue : "+cmd)
}

func EntitlementRequired() *Error {
	return NewError(contract.ErrorEntitlementRequired, "droit d'usage requis : ce serveur est en mode restreint").
		WithFix("Ouvre https://app.pupitre.studio pour renouveler le droit d'usage de ce serveur.")
}

func internalError(cause string) *Error {
	return NewError(contract.ErrorInternal, "erreur interne : "+cause)
}
