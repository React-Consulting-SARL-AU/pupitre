package daemon

import (
	"encoding/json"
	"errors"
	"pupitre.studio/agent/internal/i18n"
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

	// An installation that has just changed the machine says so now rather than
	// at the daemon's next turn: the console shows the modules instead of an
	// empty server for the following five minutes.
	server.Register("platform.sync", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		synced, err := agent.Sync()
		if err != nil {
			return nil, syncFailed(err)
		}

		result := platformSyncResult{SyncedAt: synced.SyncedAt.UTC().Format(time.RFC3339)}

		// The heartbeat is what carries the module list. Its failure is not the
		// command's: the state was read, and the daemon beats again on its own.
		if err := agent.Beat(); err == nil {
			result.HeartbeatAt = agent.options.Now().UTC().Format(time.RFC3339)
		}

		return result, nil
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
		return protocol.NewError(contract.ErrorEntitlementRequired, i18n.T("daemon.enroll.refused", cause.Error())).
			WithFix(i18n.T("daemon.enroll.refused.fix"))
	}

	return protocol.NewError(contract.ErrorInternal, i18n.T("daemon.enroll.failed", cause.Error())).
		WithFix(i18n.T("daemon.enroll.failed.fix"))
}

func syncFailed(cause error) *protocol.Error {
	if errors.Is(cause, platform.ErrNoToken) {
		return protocol.NewError(contract.ErrorBadRequest, cause.Error()).
			WithFix(i18n.T("daemon.token.missing.fix"))
	}

	var failure *platform.Error
	if errors.As(cause, &failure) && failure.Unauthorized() {
		return protocol.NewError(contract.ErrorEntitlementRequired, i18n.T("daemon.token.refused", cause.Error())).
			WithFix(i18n.T("daemon.token.refused.fix"))
	}

	return protocol.NewError(contract.ErrorInternal, i18n.T("daemon.keys.failed", cause.Error())).
		WithFix(i18n.T("daemon.keys.failed.fix"))
}
