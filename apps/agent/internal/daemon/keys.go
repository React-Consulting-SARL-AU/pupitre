package daemon

import (
	"errors"
	"slices"
	"sort"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/keys"
	"pupitre.studio/agent/internal/platform"
	"pupitre.studio/agent/internal/sys/lock"
)

// The daemon and a serve session both rewrite the signers and the block; the one waiting is gone in milliseconds.
const keysWait = 5 * time.Second

// A heartbeat names at most this many fingerprints of each kind, as the contract bounds them.
const beatFingerprints = 100

var ErrNotRoot = errors.New("the trust store is root's: pupitred serve does not run as root")

type settled struct {
	kept    []keys.Key
	pending []string
	changed bool
	moved   bool
}

type candidate struct {
	key   keys.Key
	entry contract.AgentStateKey
}

// settle brings the block and the trust store in line with what the platform asks for.
//
// The platform cannot open this server: a key enters only when it is trusted
// already or an approval signed by a trusted key admits it. It can close it:
// a trusted key it no longer asks for leaves, unsigned, unless it is the last.
func (d *Daemon) settle(wanted *[]contract.AgentStateKey) (settled, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if wanted == nil {
		if !d.silentPlatform {
			d.silentPlatform = true
			d.journal.Logf("the platform names no keys: the block and the signers stay as they are")
		}

		return settled{kept: d.Keys()}, nil
	}
	d.silentPlatform = false

	release, err := d.lockKeys()
	if err != nil {
		return settled{}, err
	}
	defer release()

	trust, err := keys.LoadTrust(d.options.Sys, d.options.SignersPath)
	if err != nil {
		return settled{}, err
	}

	now := d.options.Now()
	candidates := d.candidates(*wanted)
	admitted, accepted := d.admit(candidates, &trust, now)
	pending := pendingOf(candidates, admitted)
	moved := !slices.Equal(pending, d.pending)
	d.pending, d.pendingKnown = pending, true

	if len(admitted) == 0 {
		if !d.lastKeyHeld {
			d.lastKeyHeld = true
			d.journal.Logf("no key the platform asks for is trusted: the block and the signers stay as they are, the last key is never removed")
		}

		return settled{kept: d.Keys(), pending: pending, moved: moved}, nil
	}
	d.lastKeyHeld = false

	dropped := d.dropUnlisted(&trust, candidates, now)
	if accepted || dropped {
		if err := trust.Save(d.journal, d.options.SignersPath, now); err != nil {
			return settled{}, err
		}
	}

	kept := d.withComments(admitted)

	changed, err := keys.Sync(d.journal, d.target(), kept)
	if err != nil {
		return settled{}, err
	}

	if changed {
		d.journal.Logf("%d authorized key(s) in %s", len(kept), d.options.KeysPath)
	}

	return settled{kept: kept, pending: pending, changed: changed, moved: moved}, nil
}

// What the platform asks for, each key read as an approval names it; an option, a comment or another type drops the entry.
func (d *Daemon) candidates(wanted []contract.AgentStateKey) []candidate {
	read := make([]candidate, 0, len(wanted))

	for _, entry := range wanted {
		key, err := keys.ParseApproved(entry.PublicKey)
		if err != nil {
			d.journal.Logf("key ignored, not a bare ed25519 or ecdsa key: %s", summary(entry.PublicKey))

			continue
		}

		read = append(read, candidate{key: key, entry: entry})
	}

	return read
}

// Trusted keys the platform still asks for come first; then every approval they sign, and again with what that admitted, until nothing moves.
func (d *Daemon) admit(candidates []candidate, trust *keys.Trust, now time.Time) (map[string]keys.Key, bool) {
	admitted := map[string]keys.Key{}
	for _, c := range candidates {
		if trust.Trusts(c.key.Fingerprint()) {
			admitted[c.key.Fingerprint()] = c.key
		}
	}

	serverID := platform.LoadServerID(d.options.Sys, d.options.ServerIDPath)
	accepted := false

	for progress := true; progress; {
		progress = false
		verifier := keys.Verifier{ServerID: serverID, Trusted: values(admitted), Removed: trust.RemovedAt, Now: now}

		for _, c := range candidates {
			fingerprint := c.key.Fingerprint()
			if _, in := admitted[fingerprint]; in || !d.approved(verifier, c) {
				continue
			}

			admitted[fingerprint] = c.key
			trust.Add(c.key, keys.ViaApproval, now)
			d.journal.Logf("key %s admitted by an approval", fingerprint)
			accepted, progress = true, true
		}
	}

	return admitted, accepted
}

func (d *Daemon) approved(verifier keys.Verifier, c candidate) bool {
	for _, approval := range c.entry.Approvals {
		if err := verifier.Admits(c.key, c.entry.UserID, approval); err == nil {
			return true
		}
	}

	return false
}

// A trusted key the platform no longer asks for leaves, and its removal is remembered against older approvals.
func (d *Daemon) dropUnlisted(trust *keys.Trust, candidates []candidate, now time.Time) bool {
	listed := map[string]bool{}
	for _, c := range candidates {
		listed[c.key.Fingerprint()] = true
	}

	dropped := false
	for _, fingerprint := range trust.Fingerprints() {
		if !listed[fingerprint] && trust.Drop(fingerprint, now) {
			d.journal.Logf("key %s no longer trusted: the platform no longer asks for it", fingerprint)
			dropped = true
		}
	}

	return dropped
}

// A key already in the block keeps the comment it had there; options are never carried over.
func (d *Daemon) withComments(admitted map[string]keys.Key) []keys.Key {
	comments := map[string]string{}
	for _, listed := range d.Keys() {
		comments[listed.Blob] = listed.Comment
	}

	kept := values(admitted)
	for i := range kept {
		kept[i].Comment = comments[kept[i].Blob]
	}

	return kept
}

func pendingOf(candidates []candidate, admitted map[string]keys.Key) []string {
	pending := []string{}

	for _, c := range candidates {
		fingerprint := c.key.Fingerprint()
		if _, in := admitted[fingerprint]; !in && !slices.Contains(pending, fingerprint) {
			pending = append(pending, fingerprint)
		}
	}

	sort.Strings(pending)

	return pending
}

func values(admitted map[string]keys.Key) []keys.Key {
	listed := make([]keys.Key, 0, len(admitted))
	for _, key := range admitted {
		listed = append(listed, key)
	}

	sort.Slice(listed, func(i, j int) bool { return listed[i].Blob < listed[j].Blob })

	return listed
}

// Trust lays a key over the app's own SSH session: the root of trust. It needs root, and whoever reaches a root serve already holds the dev account.
func (d *Daemon) Trust(publicKey string) error {
	key, err := keys.ParseApproved(publicKey)
	if err != nil {
		return err
	}

	if d.options.Euid() != 0 {
		return ErrNotRoot
	}

	d.mu.Lock()
	defer d.mu.Unlock()

	release, err := d.lockKeys()
	if err != nil {
		return err
	}
	defer release()

	trust, err := keys.LoadTrust(d.options.Sys, d.options.SignersPath)
	if err != nil {
		return err
	}

	now := d.options.Now()
	forgiven := trust.Forgive(key.Fingerprint())
	if added := trust.Add(key, keys.ViaOnboarding, now); added || forgiven {
		if err := trust.Save(d.journal, d.options.SignersPath, now); err != nil {
			return err
		}

		d.journal.Logf("key %s trusted, laid over SSH", key.Fingerprint())
	}

	block := d.Keys()
	for _, listed := range block {
		if listed.Blob == key.Blob {
			return nil
		}
	}

	_, err = keys.Sync(d.journal, d.target(), append(block, key))

	return err
}

// The heartbeat speaks of the keys only once a read of the state has said which ones wait.
func (d *Daemon) keysBeat() *contract.KeysBeat {
	d.mu.Lock()
	pending, known := d.pending, d.pendingKnown
	d.mu.Unlock()

	if !known {
		return nil
	}

	trust, err := keys.LoadTrust(d.options.Sys, d.options.SignersPath)
	if err != nil {
		return nil
	}

	return &contract.KeysBeat{Signers: capped(trust.Fingerprints()), Pending: capped(slices.Clone(pending))}
}

func (d *Daemon) signers() map[string]bool {
	trust, err := keys.LoadTrust(d.options.Sys, d.options.SignersPath)
	if err != nil {
		return map[string]bool{}
	}

	trusted := map[string]bool{}
	for _, fingerprint := range trust.Fingerprints() {
		trusted[fingerprint] = true
	}

	return trusted
}

func (d *Daemon) lastPending() ([]string, bool) {
	d.mu.Lock()
	defer d.mu.Unlock()

	return slices.Clone(d.pending), d.pendingKnown
}

func (d *Daemon) lockKeys() (func(), error) {
	if d.options.KeysLock == "" {
		return func() {}, nil
	}

	return lock.Hold(d.options.KeysLock, keysWait)
}

func (d *Daemon) target() keys.Target {
	return keys.Target{Path: d.options.KeysPath, Owner: d.options.KeysOwner}
}

// Never nil: the platform refuses a heartbeat whose list is null.
func capped(fingerprints []string) []string {
	if fingerprints == nil {
		return []string{}
	}

	if len(fingerprints) > beatFingerprints {
		return fingerprints[:beatFingerprints]
	}

	return fingerprints
}
