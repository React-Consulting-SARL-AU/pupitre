package modules

import (
	"pupitre.studio/agent/internal/sys/lock"
)

// One run at a time on the machine, whatever process asks. The in-memory mutex
// only knows this process; the serve a dropped channel left behind is another
// one, still installing, and a lock on a file is what the two have in common.
func lockFile(path string) (func(), error) {
	release, held, err := lock.Acquire(path)
	if err != nil {
		return nil, err
	}

	if !held {
		return nil, busy()
	}

	return release, nil
}
