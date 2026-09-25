package daemon

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/keys"
	"pupitre.studio/agent/internal/platform"
	"pupitre.studio/agent/internal/protocol"
)

type authorizedKey struct {
	Fingerprint string `json:"fingerprint"`
	Comment     string `json:"comment,omitempty"`
	Signer      bool   `json:"signer"`
}

type keysResult struct {
	Keys     []authorizedKey `json:"keys"`
	Pending  []string        `json:"pending,omitempty"`
	SyncedAt string          `json:"synced_at,omitempty"`
}

type platformSyncResult struct {
	SyncedAt    string `json:"synced_at"`
	HeartbeatAt string `json:"heartbeat_at,omitempty"`
}

type enrollResult struct {
	Enrolled    bool                 `json:"enrolled"`
	Entitlement contract.Entitlement `json:"entitlement"`
	SyncedAt    string               `json:"synced_at,omitempty"`
}

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
			return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("command.params.unreadable", err.Error()))
		}

		token, refusal := enrollmentToken(ctx.Secrets)
		if refusal != nil {
			return nil, refusal
		}

		if err := agent.Enroll(context.Background(), token, params.PlatformURL); err != nil {
			return nil, enrollFailed(err)
		}

		result := enrollResult{Enrolled: true, Entitlement: contract.EntitlementRestricted}

		// The exchange alone enrols: a failed first read is retried by the daemon, never undone.
		if synced, err := agent.SyncAt(context.Background(), params.PlatformURL); err == nil {
			result.Entitlement = synced.Entitlement
			result.SyncedAt = synced.SyncedAt.UTC().Format(time.RFC3339)
		}

		return result, nil
	})

	server.Register("keys.sync", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		if _, err := agent.Sync(context.Background()); err != nil {
			return nil, syncFailed(err)
		}

		return agent.listed(), nil
	})

	server.Register("keys.trust", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		var params struct {
			PublicKey string `json:"public_key"`
		}
		if err := json.Unmarshal(raw, &params); err != nil {
			return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("command.params.unreadable", err.Error()))
		}

		if err := agent.Trust(params.PublicKey); err != nil {
			return nil, trustFailed(err)
		}

		return agent.listed(), nil
	})

	server.Register("platform.sync", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		synced, _, err := agent.read(context.Background(), "")
		if err != nil {
			return nil, syncFailed(err)
		}

		result := platformSyncResult{SyncedAt: synced.SyncedAt.UTC().Format(time.RFC3339)}

		// A failed beat is not the command's failure: the state was read and the daemon beats again.
		if err := agent.Beat(context.Background()); err == nil {
			result.HeartbeatAt = agent.options.Now().UTC().Format(time.RFC3339)
		}

		return result, nil
	})
}

func (d *Daemon) listed() keysResult {
	listed := d.Keys()
	trusted := d.signers()

	result := keysResult{Keys: make([]authorizedKey, 0, len(listed))}
	for _, key := range listed {
		fingerprint := key.Fingerprint()
		result.Keys = append(result.Keys, authorizedKey{Fingerprint: fingerprint, Comment: key.Comment, Signer: trusted[fingerprint]})
	}

	if pending, known := d.lastPending(); known {
		result.Pending = pending
	}

	if syncedAt := d.SyncedAt(); !syncedAt.IsZero() {
		result.SyncedAt = syncedAt.UTC().Format(time.RFC3339)
	}

	return result
}

func trustFailed(cause error) *protocol.Error {
	switch {
	case errors.Is(cause, keys.ErrKeyRefused):
		return protocol.NewError(contract.ErrorBadRequest, i18n.T("keys.trust.refused")).
			WithFix(i18n.T("keys.trust.refused.fix"))
	case errors.Is(cause, ErrNotRoot):
		return protocol.NewError(contract.ErrorBadRequest, i18n.T("keys.trust.root")).
			WithFix(i18n.T("keys.trust.root.fix"))
	}

	return protocol.NewError(contract.ErrorInternal, i18n.T("keys.trust.failed", cause.Error())).
		WithFix(i18n.T("keys.trust.failed.fix"))
}

// Read from the secret line only, never from params: it is a secret like an install password.
func enrollmentToken(line json.RawMessage) (string, *protocol.Error) {
	value, err := contract.Decode(line)
	if err == nil {
		err = contract.Validate("EnrollSecrets", value)
	}
	if err != nil {
		return "", protocol.NewError(contract.ErrorBadRequest, i18n.T("secrets.invalid", err.Error())).WithFix(i18n.T("daemon.enroll.token.fix"))
	}

	var secrets struct {
		Token string `json:"enrollment_token"`
	}
	if err := json.Unmarshal(line, &secrets); err != nil {
		return "", protocol.NewError(contract.ErrorInternal, i18n.T("secrets.unreadable", err.Error()))
	}

	return secrets.Token, nil
}

func enrollFailed(cause error) *protocol.Error {
	var failure *platform.Error
	if errors.As(cause, &failure) && failure.Unauthorized() {
		return protocol.NewError(contract.ErrorEntitlementRequired, i18n.T("daemon.enroll.refused", platform.Describe(cause))).
			WithFix(i18n.T("daemon.enroll.refused.fix"))
	}

	failed := protocol.NewError(contract.ErrorInternal, i18n.T("daemon.enroll.failed", platform.Describe(cause)))
	if platform.Down(cause) {
		return failed.WithFix(i18n.T("platform.down.fix"))
	}

	return failed.WithFix(i18n.T("daemon.enroll.failed.fix"))
}

func syncFailed(cause error) *protocol.Error {
	if errors.Is(cause, platform.ErrNoToken) {
		return protocol.NewError(contract.ErrorBadRequest, cause.Error()).
			WithFix(i18n.T("daemon.token.missing.fix"))
	}

	var failure *platform.Error
	if errors.As(cause, &failure) && failure.Unauthorized() {
		return protocol.NewError(contract.ErrorEntitlementRequired, i18n.T("daemon.token.refused", platform.Describe(cause))).
			WithFix(i18n.T("daemon.token.refused.fix", failure.Console()))
	}

	failed := protocol.NewError(contract.ErrorInternal, i18n.T("daemon.keys.failed", platform.Describe(cause)))
	if platform.Down(cause) {
		return failed.WithFix(i18n.T("platform.down.fix"))
	}

	return failed.WithFix(i18n.T("daemon.keys.failed.fix"))
}
