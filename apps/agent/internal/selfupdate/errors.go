package selfupdate

import (
	"errors"
	"fmt"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/platform"
	"pupitre.studio/agent/internal/protocol"
)

func badSignature(version string) *protocol.Error {
	return protocol.NewError(contract.ErrorBadSignature,
		fmt.Sprintf("le binaire de la version %s ne correspond pas à sa signature : rien n'a été installé", version)).
		WithFix("Relance la mise à jour depuis l'app ; si le refus persiste, signale-le, le binaire publié est en cause.")
}

func unverifiable(cause error) *protocol.Error {
	return protocol.NewError(contract.ErrorBadSignature, "signature invérifiable : "+cause.Error()).
		WithFix("Relance la mise à jour depuis l'app, qui fournit la signature de la version publiée.")
}

func downloadFailed(version string, cause error) *protocol.Error {
	var failure *platform.Error
	if errors.As(cause, &failure) && failure.NotFound() {
		return protocol.NewError(contract.ErrorBadRequest, "la plateforme ne publie pas la version "+version+" pour cette architecture").
			WithFix("Choisis une version publiée, ou laisse l'app demander la dernière.")
	}

	if errors.As(cause, &failure) && failure.Unauthorized() {
		return protocol.NewError(contract.ErrorEntitlementRequired, "la plateforme refuse le jeton de ce serveur : "+cause.Error()).
			WithFix("Ouvre https://app.pupitre.studio pour rétablir le droit d'usage de ce serveur.")
	}

	return protocol.NewError(contract.ErrorInternal, "téléchargement impossible : "+cause.Error()).
		WithFix("Vérifie que le serveur joint la plateforme en HTTPS sortant, puis relance la mise à jour.")
}

func restartFailed(version string, cause error) *protocol.Error {
	return protocol.NewError(contract.ErrorInternal,
		fmt.Sprintf("la version %s n'a pas pu redémarrer : %s", version, cause)).
		WithFix("Regarde journalctl -u pupitred sur le serveur, puis relance la mise à jour.")
}

func silent(version, restored string, cause error) *protocol.Error {
	return protocol.NewError(contract.ErrorInternal,
		fmt.Sprintf("la version %s ne répond pas au protocole (%s) : l'agent %s a été rétabli", version, cause, restored)).
		WithFix("Reste sur cette version ; signale l'incident pour que la version publiée soit corrigée.")
}
