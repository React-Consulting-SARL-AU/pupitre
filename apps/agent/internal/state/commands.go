package state

import (
	"encoding/json"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
)

type listResult struct {
	Projects []contract.Project `json:"projects"`
}

type routeRequest struct {
	Label     string `json:"label"`
	Port      int    `json:"port"`
	Subdomain string `json:"subdomain"`
	Hostname  string `json:"hostname"`
}

func requested(routes []routeRequest) []registry.RouteRequest {
	requests := make([]registry.RouteRequest, 0, len(routes))
	for _, route := range routes {
		requests = append(requests, registry.RouteRequest{Label: route.Label, Port: route.Port, Subdomain: route.Subdomain, Hostname: route.Hostname})
	}

	return requests
}

type processRequest struct {
	ID      string         `json:"id"`
	Dir     string         `json:"dir"`
	PkgMgr  string         `json:"pkgmgr"`
	Host    string         `json:"host"`
	Port    int            `json:"port"`
	Cmd     string         `json:"cmd"`
	Install string         `json:"install"`
	Routes  []routeRequest `json:"routes"`
}

// An absent folder is the project's own, an absent host the loopback: the contract's defaults, applied where the JSON is read.
func processes(requests []processRequest) []ProcessRequest {
	list := make([]ProcessRequest, 0, len(requests))
	for _, request := range requests {
		process := ProcessRequest{
			ID: request.ID, Dir: request.Dir, PkgMgr: request.PkgMgr, Host: request.Host,
			Port: request.Port, Cmd: request.Cmd, Install: request.Install, Routes: requested(request.Routes),
		}
		if process.Dir == "" {
			process.Dir = registry.RootDir
		}
		if process.Host == "" {
			process.Host = registry.Loopback
		}

		list = append(list, process)
	}

	return list
}

// A project and, when the params name one, one of its processes.
func scoped(run func(name, process string) (any, error)) protocol.Handler {
	return func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Name    string `json:"name"`
			Process string `json:"process"`
		}](raw)
		if err != nil {
			return nil, err
		}

		return run(params.Name, params.Process)
	}
}

type removeResult struct {
	Name string `json:"name"`
	Dir  string `json:"dir"`
}

type logsResult struct {
	Lines []string `json:"lines"`
}

type urlResult struct {
	URL string `json:"url"`
}

type secretResult struct {
	Key string `json:"key"`
}

type doneResult struct {
	Done bool `json:"done"`
}

type sessionsResult struct {
	Sessions []contract.Session `json:"sessions"`
}

type agentOpenResult struct {
	Command string `json:"command"`
	Session string `json:"session"`
}

type killedResult struct {
	Killed int `json:"killed"`
}

type processesResult struct {
	Processes []contract.Process `json:"processes"`
}

type shotsResult struct {
	Shots []contract.Shot `json:"shots"`
}

type shotReadResult struct {
	Path      string `json:"path"`
	MediaType string `json:"media_type"`
	SizeBytes int64  `json:"size_bytes"`
	SHA256    string `json:"sha256"`
	Chunks    int    `json:"chunks"`
}

type removedResult struct {
	Removed int `json:"removed"`
}

type doctorResult struct {
	Checks []contract.DoctorCheck `json:"checks"`
}

func RegisterCommands(server *protocol.Server, reader *Reader) {
	server.Register("snapshot", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return reader.Snapshot(), nil
	})

	server.Register("status", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return reader.Status(), nil
	})

	server.Register("service.status", identified(func(id string) (any, error) { return reader.ServiceStatus(id) }))

	server.Register("service.secret", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			ID  string `json:"id"`
			Key string `json:"key"`
		}](raw)
		if err != nil {
			return nil, err
		}

		value, err := reader.ServiceSecret(params.ID, params.Key)
		if err != nil {
			return nil, err
		}

		ctx.Emit("secret", map[string]any{"key": params.Key, "value": value})

		return secretResult{Key: params.Key}, nil
	})

	server.Register("service.start", identified(func(id string) (any, error) { return reader.StartService(id) }))
	server.Register("service.stop", identified(func(id string) (any, error) { return reader.StopService(id) }))
	server.Register("service.restart", identified(func(id string) (any, error) { return reader.RestartService(id) }))

	server.Register("service.logs", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			ID     string `json:"id"`
			Lines  int    `json:"lines"`
			Follow bool   `json:"follow"`
		}](raw)
		if err != nil {
			return nil, err
		}

		if !params.Follow {
			lines, err := reader.ServiceLogs(params.ID, params.Lines)
			if err != nil {
				return nil, err
			}

			return logsResult{Lines: lines}, nil
		}

		emit := func(line string) { ctx.Emit("log", map[string]any{"line": line}) }
		if err := reader.FollowService(ctx.Channel(), params.ID, params.Lines, emit); err != nil {
			return nil, err
		}

		return logsResult{Lines: []string{}}, nil
	})

	server.Register("completions", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Path string `json:"path"`
		}](raw)
		if err != nil {
			return nil, err
		}

		return reader.Completions(params.Path)
	})

	server.Register("project.list", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		projects, err := reader.Declared()
		if err != nil {
			return nil, err
		}

		return listResult{Projects: projects}, nil
	})

	server.Register("project.add", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Name      string            `json:"name"`
			Dir       string            `json:"dir"`
			Repo      string            `json:"repo"`
			Branch    string            `json:"branch"`
			Boot      bool              `json:"boot"`
			Runtimes  map[string]string `json:"runtimes"`
			Processes []processRequest  `json:"processes"`
		}](raw)
		if err != nil {
			return nil, err
		}

		return reader.Add(registry.Project{Name: params.Name, Dir: params.Dir, Repo: params.Repo, Branch: params.Branch, Boot: params.Boot, Runtimes: params.Runtimes}, processes(params.Processes))
	})

	server.Register("project.update", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Name  string `json:"name"`
			Patch struct {
				Branch    *string            `json:"branch"`
				Boot      *bool              `json:"boot"`
				Runtimes  *map[string]string `json:"runtimes"`
				Processes *[]processRequest  `json:"processes"`
			} `json:"patch"`
		}](raw)
		if err != nil {
			return nil, err
		}

		patch := UpdatePatch{Branch: params.Patch.Branch, Boot: params.Patch.Boot, Runtimes: params.Patch.Runtimes}
		if params.Patch.Processes != nil {
			list := processes(*params.Patch.Processes)
			patch.Processes = &list
		}

		return reader.Update(params.Name, patch)
	})

	server.Register("project.detect", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Repo   string `json:"repo"`
			Dir    string `json:"dir"`
			Branch string `json:"branch"`
		}](raw)
		if err != nil {
			return nil, err
		}

		return reader.Detect(params.Repo, params.Dir, params.Branch)
	})

	server.Register("project.remove", named(func(name string) (any, error) {
		removed, err := reader.Remove(name)
		if err != nil {
			return nil, err
		}

		return removeResult{Name: removed.Name, Dir: removed.Dir}, nil
	}))

	server.Register("project.up", scoped(func(name, process string) (any, error) { return reader.Up(name, process) }))
	server.Register("project.down", scoped(func(name, process string) (any, error) { return reader.Down(name, process) }))
	server.Register("project.restart", scoped(func(name, process string) (any, error) { return reader.Restart(name, process) }))

	server.Register("project.logs", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Name    string `json:"name"`
			Process string `json:"process"`
			Lines   int    `json:"lines"`
			Follow  bool   `json:"follow"`
		}](raw)
		if err != nil {
			return nil, err
		}

		if !params.Follow {
			lines, err := reader.Logs(params.Name, params.Process, params.Lines)
			if err != nil {
				return nil, err
			}

			return logsResult{Lines: lines}, nil
		}

		emit := func(line string) { ctx.Emit("log", map[string]any{"line": line}) }
		if err := reader.Follow(ctx.Channel(), params.Name, params.Process, params.Lines, emit); err != nil {
			return nil, err
		}

		return logsResult{Lines: []string{}}, nil
	})

	server.Register("project.install", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Name    string `json:"name"`
			Process string `json:"process"`
		}](raw)
		if err != nil {
			return nil, err
		}

		installed, err := reader.Install(params.Name, params.Process, logEmitter(ctx))
		if err != nil {
			return nil, err
		}

		return contract.ProjectInstall{Done: true, Installed: installed}, nil
	})

	server.Register("project.url", named(func(name string) (any, error) {
		address, err := reader.URL(name)
		if err != nil {
			return nil, err
		}

		return urlResult{URL: address}, nil
	}))

	server.Register("project.debug", scoped(func(name, process string) (any, error) { return reader.Debug(name, process) }))

	server.Register("project.pull", named(func(name string) (any, error) { return reader.Pull(name) }))
	server.Register("project.sync", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Name string `json:"name"`
		}](raw)
		if err != nil {
			return nil, err
		}

		return reader.Sync(params.Name, logEmitter(ctx))
	})
	server.Register("project.branches", named(func(name string) (any, error) { return reader.Branches(name) }))
	server.Register("project.git_status", named(func(name string) (any, error) { return reader.GitStatus(name) }))
	server.Register("project.working_tree", named(func(name string) (any, error) { return reader.WorkingTree(name) }))

	server.Register("project.checkout", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Name   string `json:"name"`
			Branch string `json:"branch"`
		}](raw)
		if err != nil {
			return nil, err
		}

		branch, err := reader.Checkout(params.Name, params.Branch)
		if err != nil {
			return nil, err
		}

		return contract.ProjectCheckout{Branch: branch}, nil
	})

	server.Register("project.diff", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Name string `json:"name"`
			Path string `json:"path"`
		}](raw)
		if err != nil {
			return nil, err
		}

		return reader.Diff(params.Name, params.Path)
	})

	server.Register("agent.open", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Kind    string `json:"kind"`
			Project string `json:"project"`
		}](raw)
		if err != nil {
			return nil, err
		}

		opened, err := reader.OpenAgent(params.Kind, params.Project)
		if err != nil {
			return nil, err
		}

		return agentOpenResult(opened), nil
	})

	server.Register("sessions.list", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return sessionsResult{Sessions: reader.Sessions()}, nil
	})

	server.Register("sessions.clean", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return killedResult{Killed: reader.CleanSessions()}, nil
	})

	server.Register("processes.list", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return processesResult{Processes: reader.Processes()}, nil
	})

	server.Register("process.kill", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			PID   int  `json:"pid"`
			Force bool `json:"force"`
		}](raw)
		if err != nil {
			return nil, err
		}

		if err := reader.Kill(params.PID, params.Force); err != nil {
			return nil, err
		}

		return doneResult{Done: true}, nil
	})

	server.Register("shots.list", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return shotsResult{Shots: reader.Shots()}, nil
	})

	server.Register("shots.url", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return urlResult{URL: reader.ShotsURL()}, nil
	})

	server.Register("shots.read", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Path string `json:"path"`
		}](raw)
		if err != nil {
			return nil, err
		}

		shot, err := reader.ReadShot(params.Path)
		if err != nil {
			return nil, err
		}

		chunks := ChunkShot(shot.Bytes)
		for seq, encoded := range chunks {
			ctx.Emit("shot", map[string]any{"seq": seq, "bytes": encoded})
		}

		return shotReadResult{
			Path:      shot.Path,
			MediaType: shot.MediaType,
			SizeBytes: shot.SizeBytes,
			SHA256:    shot.Digest,
			Chunks:    len(chunks),
		}, nil
	})

	server.Register("shots.clean", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Path string `json:"path"`
		}](raw)
		if err != nil {
			return nil, err
		}

		if params.Path == "" {
			return removedResult{Removed: reader.CleanShots()}, nil
		}

		if err := reader.RemoveShot(params.Path); err != nil {
			return nil, err
		}

		return removedResult{Removed: 1}, nil
	})

	server.Register("fs.list", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Path string `json:"path"`
		}](raw)
		if err != nil {
			return nil, err
		}

		return reader.ListFiles(params.Path)
	})

	server.Register("fs.stat", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Path string `json:"path"`
			Hash bool   `json:"hash"`
		}](raw)
		if err != nil {
			return nil, err
		}

		return reader.StatFile(params.Path, params.Hash)
	})

	server.Register("fs.read", func(ctx *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Path string `json:"path"`
		}](raw)
		if err != nil {
			return nil, err
		}

		content, err := reader.ReadFile(params.Path)
		if err != nil {
			return nil, err
		}

		chunks := ChunkFile(content.Bytes)
		for seq, encoded := range chunks {
			ctx.Emit("file", map[string]any{"seq": seq, "bytes": encoded})
		}

		return contract.FileRead{
			Path:      content.Path,
			MediaType: content.MediaType,
			SizeBytes: content.SizeBytes,
			SHA256:    content.Digest,
			Chunks:    len(chunks),
		}, nil
	})

	server.Register("fs.write", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Path    string `json:"path"`
			Content string `json:"content"`
			SHA256  string `json:"sha256"`
		}](raw)
		if err != nil {
			return nil, err
		}

		return reader.WriteFile(params.Path, params.Content, params.SHA256)
	})

	server.Register("fs.mkdir", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Path string `json:"path"`
		}](raw)
		if err != nil {
			return nil, err
		}

		return reader.MakeFolder(params.Path)
	})

	server.Register("fs.rename", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Path string `json:"path"`
			To   string `json:"to"`
		}](raw)
		if err != nil {
			return nil, err
		}

		return reader.MoveFile(params.Path, params.To)
	})

	server.Register("fs.remove", func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			Path      string `json:"path"`
			Recursive bool   `json:"recursive"`
		}](raw)
		if err != nil {
			return nil, err
		}

		return reader.RemoveFile(params.Path, params.Recursive)
	})

	server.Register("reboot", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		if err := reader.Reboot(); err != nil {
			return nil, err
		}

		return doneResult{Done: true}, nil
	})

	server.Register("doctor", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return doctorResult{Checks: reader.Doctor()}, nil
	})

	server.Register("diag", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return reader.Diag(), nil
	})
}

// What a command prints travels on log events, the shape of project.logs: the contract admits events before a response.
func logEmitter(ctx *protocol.Context) func(string) {
	return func(line string) { ctx.Emit("log", map[string]any{"line": line}) }
}

func identified(run func(string) (any, error)) protocol.Handler {
	return func(_ *protocol.Context, raw json.RawMessage) (any, error) {
		params, err := decode[struct {
			ID string `json:"id"`
		}](raw)
		if err != nil {
			return nil, err
		}

		return run(params.ID)
	}
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
		return params, protocol.NewError(contract.ErrorBadRequest, i18n.T("command.params.unreadable", err.Error()))
	}

	return params, nil
}
