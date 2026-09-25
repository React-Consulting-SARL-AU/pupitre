package modules

import (
	"pupitre.studio/agent/internal/sys/lock"
)

// The mutex only knows this process; a serve left behind by a dropped channel is another one, still installing.
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
