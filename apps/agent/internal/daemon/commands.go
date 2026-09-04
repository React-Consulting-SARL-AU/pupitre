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

func RegisterCommands(server *protocol.Server, options Options) {
	agent := New(options)

	server.Register("keys.list", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return agent.listed(), nil
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
