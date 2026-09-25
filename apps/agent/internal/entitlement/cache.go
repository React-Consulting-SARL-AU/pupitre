package entitlement

import (
	"encoding/json"
	"errors"
	"path"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/sys"
)

const (
	cacheMode = 0o600
	cacheDir  = 0o700

	platformValid     = "valid"
	platformGrace     = "grace"
	platformSuspended = "suspended"
)

type Cache struct {
	State      string    `json:"state"`
	ValidUntil time.Time `json:"valid_until"`
	CheckedAt  time.Time `json:"checked_at"`
}

func ReadCache(machine sys.Sys, filePath string) (Cache, error) {
	if machine == nil {
		return Cache{}, errors.New("no machine to read")
	}

	raw, err := machine.ReadFile(filePath)
	if err != nil {
		return Cache{}, err
	}

	var cache Cache
	if err := json.Unmarshal(raw, &cache); err != nil {
		return Cache{}, err
	}

	if cache.CheckedAt.IsZero() {
		return Cache{}, errors.New("entitlement cache without a read date")
	}

	return cache, nil
}

func WriteCache(machine sys.Sys, filePath string, cache Cache) error {
	if machine == nil {
		return errors.New("no machine to write to")
	}

	raw, err := json.Marshal(cache)
	if err != nil {
		return err
	}

	if err := machine.MkdirAll(path.Dir(filePath), cacheDir); err != nil {
		return err
	}

	return machine.WriteFile(filePath, append(raw, '\n'), cacheMode)
}

// Past the platform's 24-hour grant, the tolerance keeps everything running until seven days of silence.
func (c Cache) Resolve(now time.Time, tolerance time.Duration) contract.Entitlement {
	if now.Sub(c.CheckedAt) > tolerance {
		return contract.EntitlementRestricted
	}

	switch c.State {
	case platformSuspended:
		return contract.EntitlementRestricted
	case platformGrace:
		return contract.EntitlementGrace
	case platformValid:
		if now.After(c.ValidUntil) {
			return contract.EntitlementGrace
		}

		return contract.EntitlementValid
	}

	return contract.EntitlementRestricted
}
