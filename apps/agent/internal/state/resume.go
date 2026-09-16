package state

import (
	"encoding/json"
	"sort"

	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/tmux"
)

// The record of what should be up: every window a start opened and no stop has closed since.
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

// A start records its window and a stop forgets it, whether or not tmux held one: the record says what the reader wants up, not what the machine happens to run.
func (r *Reader) note(window string, up bool) error {
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

// Resume brings back what was up before the machine went down, and answers the windows it started.
//
// A boot is the one moment the tmux session is gone: a daemon restarted for an
// upgrade finds the session alive with everything in it, and touches nothing.
// A window whose project or process is no longer declared, or is a service
// row systemd owns, is dropped from the record; a start that fails is logged
// and stays recorded, since the wish to run it has not changed.
func (r *Reader) Resume() []string {
	ctx := r.ctx()

	if tmux.Alive(ctx, r.options.Tmux) {
		return nil
	}

	file := r.registry()
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

	if err := r.record(kept); err != nil {
		ctx.Logf("resume: the record could not be written: %v", err)
	}

	return started
}
