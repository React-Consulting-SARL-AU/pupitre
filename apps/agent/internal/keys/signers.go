package keys

import (
	"encoding/json"
	"errors"
	"io/fs"
	"path/filepath"
	"sort"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	DefaultPath        = "/home/dev/.ssh/authorized_keys"
	DefaultSignersPath = "/etc/pupitre/signers.json"
	// Serialises the daemon and a serve session, which both rewrite the signers and the block.
	DefaultLockPath = "/var/lib/pupitre/keys.lock"

	ViaOnboarding = "onboarding"
	ViaApproval   = "approval"
	ViaMigration  = "migration"
	ViaReset      = "reset"

	signersMode = fs.FileMode(0o600)
	signersDir  = fs.FileMode(0o700)
)

type Signer struct {
	PublicKey string `json:"public_key"`
	Via       string `json:"via"`
	Since     string `json:"since"`
}

// An approval issued before the removal cannot bring the key back.
type Removal struct {
	Fingerprint string `json:"fingerprint"`
	At          string `json:"at"`
}

// A key enters only laid over SSH or admitted by a valid approval.
type Trust struct {
	Signers []Signer  `json:"signers"`
	Removed []Removal `json:"removed"`
}

// An absent file is an empty set; an unreadable one is an error, never an empty set.
func LoadTrust(machine sys.Sys, path string) (Trust, error) {
	raw, err := machine.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return Trust{}, nil
	}

	if err != nil {
		return Trust{}, err
	}

	var trust Trust
	if err := json.Unmarshal(raw, &trust); err != nil {
		return Trust{}, err
	}

	kept := trust.Signers[:0]
	for _, signer := range trust.Signers {
		if _, err := ParseApproved(signer.PublicKey); err == nil {
			kept = append(kept, signer)
		}
	}
	trust.Signers = kept

	return trust, nil
}

// Forgets the removals no still-valid approval could predate.
func (t Trust) Save(ctx sys.Context, path string, now time.Time) error {
	horizon := now.Add(-time.Duration(contract.KeyApprovalRules.MaxAgeSeconds) * time.Second)

	stored := Trust{Signers: t.Signers, Removed: []Removal{}}
	if stored.Signers == nil {
		stored.Signers = []Signer{}
	}

	for _, removal := range t.Removed {
		if at, err := time.Parse(time.RFC3339, removal.At); err == nil && at.After(horizon) {
			stored.Removed = append(stored.Removed, removal)
		}
	}

	encoded, err := json.MarshalIndent(stored, "", "  ")
	if err != nil {
		return err
	}

	if err := ctx.Sys().MkdirAll(filepath.Dir(path), signersDir); err != nil {
		return err
	}

	return file.WriteAtomic(ctx, path, append(encoded, '\n'), signersMode)
}

func (t Trust) Keys() []Key {
	trusted := make([]Key, 0, len(t.Signers))

	for _, signer := range t.Signers {
		if key, err := ParseApproved(signer.PublicKey); err == nil {
			trusted = append(trusted, key)
		}
	}

	return trusted
}

func (t Trust) Trusts(fingerprint string) bool {
	for _, key := range t.Keys() {
		if key.Fingerprint() == fingerprint {
			return true
		}
	}

	return false
}

func (t Trust) Fingerprints() []string {
	fingerprints := []string{}
	for _, key := range t.Keys() {
		fingerprints = append(fingerprints, key.Fingerprint())
	}

	sort.Strings(fingerprints)

	return fingerprints
}

// A key already trusted keeps how and when it came.
func (t *Trust) Add(key Key, via string, now time.Time) bool {
	if t.Trusts(key.Fingerprint()) {
		return false
	}

	t.Signers = append(t.Signers, Signer{PublicKey: key.Bare(), Via: via, Since: stamp(now)})

	return true
}

func (t *Trust) Drop(fingerprint string, now time.Time) bool {
	kept := make([]Signer, 0, len(t.Signers))
	dropped := false

	for _, signer := range t.Signers {
		key, err := ParseApproved(signer.PublicKey)
		if err == nil && key.Fingerprint() == fingerprint {
			dropped = true

			continue
		}

		kept = append(kept, signer)
	}

	if !dropped {
		return false
	}

	t.Signers = kept
	t.Forgive(fingerprint)
	t.Removed = append(t.Removed, Removal{Fingerprint: fingerprint, At: stamp(now)})

	return true
}

// Laying a key again over SSH outranks any approval.
func (t *Trust) Forgive(fingerprint string) bool {
	kept := make([]Removal, 0, len(t.Removed))

	for _, removal := range t.Removed {
		if removal.Fingerprint != fingerprint {
			kept = append(kept, removal)
		}
	}

	forgiven := len(kept) != len(t.Removed)
	t.Removed = kept

	return forgiven
}

func (t Trust) RemovedAt(fingerprint string) (time.Time, bool) {
	var latest time.Time
	found := false

	for _, removal := range t.Removed {
		at, err := time.Parse(time.RFC3339, removal.At)
		if removal.Fingerprint != fingerprint || err != nil {
			continue
		}

		if !found || at.After(latest) {
			latest, found = at, true
		}
	}

	return latest, found
}

func stamp(now time.Time) string {
	return now.UTC().Format(time.RFC3339)
}
