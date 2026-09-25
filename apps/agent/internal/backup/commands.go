package backup

import (
	"encoding/json"
	"regexp"
	"unicode/utf16"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/protocol"
)

type doneResult struct {
	Done bool `json:"done"`
}

// Credentials are never among the parameters: they arrive on the secret line.
type bucketParams struct {
	Location contract.BackupLocation `json:"location"`
	Revert   bool                    `json:"revert"`
	Parts    []string                `json:"parts"`
	Start    *bool                   `json:"start"`
}

func RegisterCommands(server *protocol.Server, service *Service) {
	server.Register("backup.status", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return service.Status()
	})

	server.Register("backup.contents", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return service.Contents()
	})

	server.Register("backup.run", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		var params struct {
			Name      string `json:"name"`
			Databases *bool  `json:"databases"`
			Projects  string `json:"projects"`
		}

		if err := json.Unmarshal(raw, &params); err != nil {
			return nil, unreadable(err)
		}

		if params.Name != "" && !Nameable(params.Name) {
			return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("backup.name.invalid", contract.Backup.NameMax))
		}

		return service.Run(modules.Emitter(ctx), contract.BackupTriggerManual, Overrides{Name: params.Name, Databases: params.Databases, Projects: params.Projects})
	})

	server.Register("backup.delete", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		var params struct {
			ID string `json:"id"`
		}

		if err := json.Unmarshal(raw, &params); err != nil {
			return nil, unreadable(err)
		}

		return service.Delete(params.ID)
	})

	server.Register("backup.inspect", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		params, secrets, err := bucketRequest(ctx, raw)
		if err != nil {
			return nil, err
		}

		return service.Inspect(params.Location, secrets)
	})

	server.Register("backup.restore.setup", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		params, secrets, err := bucketRequest(ctx, raw)
		if err != nil {
			return nil, err
		}

		return service.RestoreSetup(modules.Emitter(ctx), params.Location, secrets, params.Revert)
	})

	server.Register("backup.restore.data", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		params, secrets, err := bucketRequest(ctx, raw)
		if err != nil {
			return nil, err
		}

		start := params.Start == nil || *params.Start

		return service.RestoreData(modules.Emitter(ctx), params.Location, secrets, params.Parts, start)
	})

	server.Register("backup.restore.abort", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		if err := service.Abort(); err != nil {
			return nil, err
		}

		return doneResult{Done: true}, nil
	})
}

func bucketRequest(ctx *protocol.Context, raw json.RawMessage) (bucketParams, contract.BackupSecrets, error) {
	var params bucketParams
	if err := json.Unmarshal(raw, &params); err != nil {
		return bucketParams{}, contract.BackupSecrets{}, unreadable(err)
	}

	value, err := contract.Decode(ctx.Secrets)
	if err == nil {
		err = contract.Validate("BackupSecrets", value)
	}

	if err != nil {
		return bucketParams{}, contract.BackupSecrets{}, protocol.NewError(contract.ErrorBadRequest, i18n.T("secrets.invalid", err.Error())).
			WithFix(i18n.T("backup.secrets.fix"))
	}

	var secrets contract.BackupSecrets
	if err := json.Unmarshal(ctx.Secrets, &secrets); err != nil {
		return bucketParams{}, contract.BackupSecrets{}, unreadable(err)
	}

	return params, secrets, nil
}

var namePattern = regexp.MustCompile(contract.Backup.NamePattern)

// Length counts UTF-16 units, as the platform does before taking the declaration.
func Nameable(name string) bool {
	return namePattern.MatchString(name) && len(utf16.Encode([]rune(name))) <= contract.Backup.NameMax
}

func unreadable(err error) error {
	return protocol.NewError(contract.ErrorBadRequest, i18n.T("command.params.unreadable", err.Error()))
}
