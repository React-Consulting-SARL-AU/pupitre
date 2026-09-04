package state

import (
	"encoding/json"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
)

type listResult struct {
	Projects []contract.Project `json:"projects"`
}

type removeResult struct {
	Name string `json:"name"`
	Dir  string `json:"dir"`
}

type logsResult struct {
	Lines []string `json:"lines"`
}

type installResult struct {
	Done    bool   `json:"done"`
	Command string `json:"command,omitempty"`
}

type urlResult struct {
	URL string `json:"url"`
}

func RegisterCommands(server *protocol.Server, reader *Reader) {
	server.Register("snapshot", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return reader.Snapshot(), nil
	})

	server.Register("status", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return reader.Status(), nil
	})

	server.Register("service.status", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			ID string `json:"id"`
		}](raw)
		if err != nil {
			return nil, err
		}

		return reader.ServiceStatus(params.ID)
	})

	server.Register("project.list", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return listResult{Projects: reader.List()}, nil
	})

	server.Register("project.add", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Name      string `json:"name"`
			Dir       string `json:"dir"`
			Repo      string `json:"repo"`
			PkgMgr    string `json:"pkgmgr"`
			Host      string `json:"host"`
			Port      int    `json:"port"`
			Subdomain string `json:"subdomain"`
			Cmd       string `json:"cmd"`
			Install   string `json:"install"`
		}](raw)
		if err != nil {
			return nil, err
		}

		return reader.Add(registry.Project{
			Name: params.Name, Dir: params.Dir, Repo: params.Repo, PkgMgr: params.PkgMgr,
			Host: params.Host, Port: params.Port, Subdomain: params.Subdomain,
			Cmd: params.Cmd, Install: params.Install,
		})
	})

	server.Register("project.remove", named(func(name string) (any, error) {
		removed, err := reader.Remove(name)
		if err != nil {
			return nil, err
		}

		return removeResult{Name: removed.Name, Dir: removed.Dir}, nil
	}))

	server.Register("project.up", named(func(name string) (any, error) { return reader.Up(name) }))
	server.Register("project.down", named(func(name string) (any, error) { return reader.Down(name) }))
	server.Register("project.restart", named(func(name string) (any, error) { return reader.Restart(name) }))

	server.Register("project.logs", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Name   string `json:"name"`
			Lines  int    `json:"lines"`
			Follow bool   `json:"follow"`
		}](raw)
		if err != nil {
			return nil, err
		}

		if !params.Follow {
			lines, err := reader.Logs(params.Name, params.Lines)
			if err != nil {
				return nil, err
			}

			return logsResult{Lines: lines}, nil
		}

		emit := func(line string) { ctx.Emit("log", map[string]any{"line": line}) }
		if err := reader.Follow(params.Name, params.Lines, emit); err != nil {
			return nil, err
		}

		return logsResult{Lines: []string{}}, nil
	})

	server.Register("project.install", named(func(name string) (any, error) {
		command, err := reader.Install(name)
		if err != nil {
			return nil, err
		}

		return installResult{Done: true, Command: command}, nil
	}))

	server.Register("project.url", named(func(name string) (any, error) {
		address, err := reader.URL(name)
		if err != nil {
			return nil, err
		}

		return urlResult{URL: address}, nil
	}))
}

func named(run func(string) (any, error)) protocol.Handler {
	return func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Name string `json:"name"`
		}](raw)
		if err != nil {
			return nil, err
		}

		return run(params.Name)
	}
}

func decode[T any](raw json.RawMessage) (T, error) {
	var params T
	if err := json.Unmarshal(raw, &params); err != nil {
		return params, protocol.NewError(contract.ErrorBadRequest, "paramètres illisibles : "+err.Error())
	}

	return params, nil
}
