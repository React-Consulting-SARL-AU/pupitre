package state

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys/env"
)

// The value of one credential of a module, read from /etc/pupitre/env and returned to the caller alone: never logged, never persisted, never handed back in the result envelope.
func (r *Reader) ServiceSecret(id, key string) (string, error) {
	module, known := r.module(id)
	if !known {
		return "", protocol.NewError(contract.ErrorServiceNotFound, i18n.T("state.service.unknown", id)).
			WithFix(i18n.T("state.service.unknown.fix"))
	}

	ctx := r.moduleContext(module)

	status, err := module.Status(ctx)
	if err != nil {
		return "", err
	}

	if !status.Installed {
		return "", modules.NotInstalled(id, module.Manifest().Name)
	}

	if !owns(status.Credentials, key) {
		return "", protocol.NewError(contract.ErrorBadRequest, i18n.T("state.secret.foreign", key, id)).
			WithFix(i18n.T("state.secret.foreign.fix", id))
	}

	value, present, err := env.Get(ctx, key)
	if err != nil {
		return "", err
	}

	if !present || value == "" {
		return "", protocol.NewError(contract.ErrorBadRequest, i18n.T("state.secret.missing", key)).
			WithFix(i18n.T("state.secret.missing.fix", id))
	}

	return value, nil
}

func owns(credentials map[string]string, key string) bool {
	for _, envKey := range credentials {
		if envKey == key {
			return true
		}
	}

	return false
}
