package state

import (
	"encoding/json"
	"slices"
	"sort"

	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/tmux"
)

type running struct {
	Windows []string `json:"windows"`
}

func (r *Reader) recorded() []string {
	raw, err := file.Read(r.ctx(), r.options.Paths.Resolved().Running)
	if err != nil {
		return nil
	}

	var record running
	if err := json.Unmarshal(raw, &record); err != nil {
		return nil
	}

	return record.Windows
}

func (r *Reader) Wanted() []string {
	names := []string{}

	for _, window := range r.recorded() {
		name, _, ours := registry.SplitWindow(window)
		if ours && !slices.Contains(names, name) {
			names = append(names, name)
		}
	}

	return names
}

func (r *Reader) record(windows map[string]bool) error {
	names := make([]string, 0, len(windows))

	for window := range windows {
		names = append(names, window)
	}

	sort.Strings(names)

	encoded, err := json.MarshalIndent(running{Windows: names}, "", "  ")
	if err != nil {
		return err
	}

	return file.WriteAtomic(r.ctx(), r.options.Paths.Resolved().Running, append(encoded, '\n'), 0o600)
}

// The record holds what the reader wants up, whether or not tmux currently runs it.
func (r *Reader) note(window string, up bool) error {
	release, err := r.hold()
	if err != nil {
		return err
	}
	defer release()

	windows := map[string]bool{}

	for _, name := range r.recorded() {
		windows[name] = true
	}

	if up {
		windows[window] = true
	} else {
		delete(windows, window)
	}

	return r.record(windows)
}

// Only a boot finds the tmux session gone; a daemon restarted for an upgrade finds it alive and touches nothing.
func (r *Reader) Resume() []string {
	ctx := r.ctx()

	if tmux.Alive(ctx, r.options.Tmux) {
		return nil
	}

	// An unreadable registry leaves the record untouched: a boot must not lose what was up.
	file, err := r.declared()
	if err != nil {
		ctx.Logf("resume: %v", err)

		return nil
	}

	kept := map[string]bool{}
	started := []string{}

	for _, window := range r.recorded() {
		name, id, ours := registry.SplitWindow(window)
		if !ours {
			continue
		}

		project, known := file.Get(name)
		if !known {
			continue
		}

		process, declared := project.Process(id)
		if !declared || process.IsService() {
			continue
		}

		kept[window] = true

		if err := r.start(project, process); err != nil {
			ctx.Logf("resume %s: %v", window, err)

			continue
		}

		started = append(started, window)
	}

	for _, project := range file.Projects {
		if !project.Boot {
			continue
		}

		for _, process := range project.Processes {
			window := project.Window(process.ID)
			if process.IsService() || kept[window] {
				continue
			}

			kept[window] = true

			if err := r.start(project, process); err != nil {
				ctx.Logf("resume %s: %v", window, err)

				continue
			}

			started = append(started, window)
		}
	}

	if err := r.record(kept); err != nil {
		ctx.Logf("resume: the record could not be written: %v", err)
	}

	return started
}
