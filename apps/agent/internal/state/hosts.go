package state

import (
	"bytes"
	"errors"
	"io/fs"
	"sort"
	"strings"

	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	hostsPath  = "/etc/hosts"
	hostsBlock = "projects"
)

// Unlike a laptop, a server does not resolve *.localhost; IPv4 only, where the port is probed and the tunnel knocks.
func syncLocalNames(ctx sys.Context, reg *registry.File) error {
	current, err := file.Read(ctx, hostsPath)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}

	updated := file.WithBlock(current, hostsBlock, renderLocalNames(reg.Projects))
	if bytes.Equal(updated, current) {
		return nil
	}

	return file.WriteAtomic(ctx, hostsPath, updated, 0o644)
}

// A restored registry skipped project.add, so its .localhost names are written here.
func (r *Reader) SyncHosts() error {
	return r.rewrite(func(reg *registry.File) error {
		return syncLocalNames(r.ctx(), reg)
	})
}

func renderLocalNames(projects []registry.Project) []byte {
	seen := map[string]bool{}
	lines := []string{}

	for _, project := range projects {
		for _, host := range project.Hosts() {
			if seen[host] || !registry.LocalhostPattern.MatchString(host) {
				continue
			}

			seen[host] = true
			lines = append(lines, registry.Loopback+" "+host)
		}
	}

	if len(lines) == 0 {
		return nil
	}

	sort.Strings(lines)

	return []byte(strings.Join(lines, "\n") + "\n")
}
