package daemon

import (
	"encoding/json"
	"errors"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/platform"
	"pupitre.studio/agent/internal/protocol"
)

type authorizedKey struct {
	Fingerprint string `json:"fingerprint"`
	Comment     string `json:"comment,omitempty"`
}

type keysResult struct {
	Keys     []authorizedKey `json:"keys"`
	SyncedAt string          `json:"synced_at,omitempty"`
}

type enrollResult struct {
	Enrolled    bool                 `json:"enrolled"`
	Entitlement contract.Entitlement `json:"entitlement"`
	SyncedAt    string               `json:"synced_at,omitempty"`
}

const enrollFix = `Écris le jeton d'enrôlement sur la ligne suivante, sous la forme {"enrollment_token": "<jeton>"}.`

func RegisterCommands(server *protocol.Server, options Options) {
	agent := New(options)

	server.Register("keys.list", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return agent.listed(), nil
	})

	server.Register("enroll", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		var params struct {
			PlatformURL string `json:"platform_url"`
		}
		if err := json.Unmarshal(raw, &params); err != nil {
			return nil, protocol.NewError(contract.ErrorBadRequest, "paramètres illisibles : "+err.Error())
		}

		token, refusal := enrollmentToken(ctx.Secrets)
		if refusal != nil {
			return nil, refusal
		}

		if err := agent.Enroll(token, params.PlatformURL); err != nil {
			return nil, enrollFailed(err)
		}

		result := enrollResult{Enrolled: true, Entitlement: contract.EntitlementRestricted}

		// The exchange is what enrols; a first state that does not come back is retried by the daemon rather than undoing it.
		if synced, err := agent.SyncAt(params.PlatformURL); err == nil {
			result.Entitlement = synced.Entitlement
			result.SyncedAt = synced.SyncedAt.UTC().Format(time.RFC3339)
		}

		return result, nil
	})

	server.Register("keys.sync", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		if _, err := agent.Sync(); err != nil {
			return nil, syncFailed(err)
		}

		return agent.listed(), nil
	})
}

func (d *Daemon) listed() keysResult {
	listed := d.Keys()

	result := keysResult{Keys: make([]authorizedKey, 0, len(listed))}
	for _, key := range listed {
		result.Keys = append(result.Keys, authorizedKey{Fingerprint: key.Fingerprint(), Comment: key.Comment})
	}

	if syncedAt := d.SyncedAt(); !syncedAt.IsZero() {
		result.SyncedAt = syncedAt.UTC().Format(time.RFC3339)
	}

	return result
}

// The token comes off the secret line and is never read back out of params: it is a secret the way an install password is.
func enrollmentToken(line json.RawMessage) (string, *protocol.Error) {
	value, err := contract.Decode(line)
	if err == nil {
		err = contract.Validate("EnrollSecrets", value)
	}
	if err != nil {
		return "", protocol.NewError(contract.ErrorBadRequest, "flux secret invalide : "+err.Error()).WithFix(enrollFix)
	}

	var secrets struct {
		Token string `json:"enrollment_token"`
	}
	if err := json.Unmarshal(line, &secrets); err != nil {
		return "", protocol.NewError(contract.ErrorInternal, "flux secret validé mais illisible : "+err.Error())
	}

	return secrets.Token, nil
}

func enrollFailed(cause error) *protocol.Error {
	var failure *platform.Error
	if errors.As(cause, &failure) && failure.Unauthorized() {
		return protocol.NewError(contract.ErrorEntitlementRequired, "la plateforme refuse ce jeton d'enrôlement : "+cause.Error()).
			WithFix("Relance l'installation depuis l'app pour obtenir un jeton neuf.")
	}

	return protocol.NewError(contract.ErrorInternal, "enrôlement impossible : "+cause.Error()).
		WithFix("Vérifie que le serveur joint la plateforme en HTTPS sortant, puis relance l'installation.")
}

func syncFailed(cause error) *protocol.Error {
	if errors.Is(cause, platform.ErrNoToken) {
		return protocol.NewError(contract.ErrorBadRequest, cause.Error()).
			WithFix("Réinstalle ce serveur depuis l'app pour lui rendre un jeton de serveur.")
	}

	var failure *platform.Error
	if errors.As(cause, &failure) && failure.Unauthorized() {
		return protocol.NewError(contract.ErrorEntitlementRequired, "la plateforme refuse le jeton de ce serveur : "+cause.Error()).
			WithFix("Ouvre https://app.pupitre.studio pour rétablir le droit d'usage de ce serveur.")
	}

	return protocol.NewError(contract.ErrorInternal, "clés non synchronisées : "+cause.Error()).
		WithFix("Vérifie que le serveur joint la plateforme en HTTPS sortant, puis relance keys.sync.")
}
