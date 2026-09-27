package access

import (
	"encoding/json"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
)

type listResult struct {
	Keys []Listed `json:"keys"`
}

type revokeResult struct {
	ID string `json:"id"`
}

func RegisterCommands(server *protocol.Server, store *Store) {
	server.Register("access.list", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		keys, err := store.List()
		if err != nil {
			return nil, err
		}

		return listResult{Keys: keys}, nil
	})

	server.Register("access.create", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			ID       string   `json:"id"`
			Name     string   `json:"name"`
			Hash     string   `json:"hash"`
			Projects []string `json:"projects"`
		}](raw)
		if err != nil {
			return nil, err
		}

		return store.Create(params.ID, params.Name, params.Hash, params.Projects)
	})

	server.Register("access.update", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			ID       string          `json:"id"`
			Name     *string         `json:"name"`
			Projects json.RawMessage `json:"projects"`
		}](raw)
		if err != nil {
			return nil, err
		}

		scope, err := scopeOf(params.Projects)
		if err != nil {
			return nil, err
		}

		return store.Update(params.ID, params.Name, scope)
	})

	server.Register("access.revoke", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			ID string `json:"id"`
		}](raw)
		if err != nil {
			return nil, err
		}

		if err := store.Revoke(params.ID); err != nil {
			return nil, err
		}

		return revokeResult{ID: params.ID}, nil
	})
}

// Absent keeps the scope; null opens the whole server.
func scopeOf(raw json.RawMessage) (*[]string, error) {
	if len(raw) == 0 {
		return nil, nil
	}

	var projects []string
	if err := json.Unmarshal(raw, &projects); err != nil {
		return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("command.params.unreadable", err.Error()))
	}

	return &projects, nil
}

func decode[T any](raw json.RawMessage) (T, error) {
	var params T
	if err := json.Unmarshal(raw, &params); err != nil {
		return params, protocol.NewError(contract.ErrorBadRequest, i18n.T("command.params.unreadable", err.Error()))
	}

	return params, nil
}
