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

// A repository that freezes --host react-box.localhost assumes what a laptop does on its own — resolving *.localhost on the loopback — and a server does not: without this block, a dev server binding to that name waits for ever. IPv4 only, so it listens where the port is probed and the tunnel knocks.
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

func renderLocalNames(projects []registry.Project) []byte {
	seen := map[string]bool{}
	lines := []string{}

	for _, project := range projects {
		if seen[project.Host] || !registry.LocalhostPattern.MatchString(project.Host) {
			continue
		}

		seen[project.Host] = true
		lines = append(lines, registry.Loopback+" "+project.Host)
	}

	if len(lines) == 0 {
		return nil
	}

	sort.Strings(lines)

	return []byte(strings.Join(lines, "\n") + "\n")
}
