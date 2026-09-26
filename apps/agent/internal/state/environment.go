package state

import (
	"bytes"
	"encoding/json"
	"path"

	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys/user"
)

func (r *Reader) processEnvironment(project registry.Project, process registry.Process) []string {
	return project.ProcessEnvironment(r.options.Paths.Resolved().Projects, r.domain(), process).List()
}

// dev cannot read the registry, so what each folder receives is written where its shell reads it; unchanged, nothing is written.
func (r *Reader) syncEnvironment(reg *registry.File) error {
	if reg.Problem() != nil {
		return nil
	}

	encoded, err := json.MarshalIndent(reg.EnvironmentDocument(), "", "  ")
	if err != nil {
		return err
	}

	encoded = append(encoded, '\n')

	ctx := r.ctx()
	owner := r.options.Tmux.User
	home := user.Home(owner)

	if current, err := ctx.Sys().ReadFileIn(home, registry.EnvironmentFile); err == nil && bytes.Equal(current, encoded) {
		return nil
	}

	if err := ctx.Sys().MkdirIn(home, path.Dir(registry.EnvironmentFile), owner); err != nil {
		return err
	}

	return ctx.Sys().WriteFileIn(home, registry.EnvironmentFile, owner, encoded)
}

// A read heals what no write of the registry announced: a domain moved by the exposure, a binary just upgraded.
func (r *Reader) healEnvironment(reg *registry.File) {
	if err := r.syncEnvironment(reg); err != nil {
		ctx := r.ctx()
		_ = ctx.Once("environment: "+err.Error(), func() error {
			ctx.Logf("%s: not written: %s", registry.EnvironmentFile, err)

			return nil
		})
	}
}
