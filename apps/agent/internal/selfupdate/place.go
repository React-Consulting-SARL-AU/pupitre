package selfupdate

import (
	"errors"

	"pupitre.studio/agent/internal/platform"
)

type Staged struct {
	Version        string
	Signature      string
	Binary         []byte
	AllowDowngrade bool
	// Sudo asked for the password; the bare `pupitred binary install` line runs without one.
	Privileged bool
}

var errPushed = errors.New("a pushed binary is not asked of the platform")

// Held to the same bar as a download: embedded-key signature over version, arch and bytes, running version as floor.
func (u *Upgrader) Place(staged Staged) (Result, error) {
	ctx := u.context()
	fingerprint := Fingerprint(staged.Binary)

	key, err := u.publicKey()
	switch {
	case errors.Is(err, errNoPublicKey) && !staged.Privileged:
		return Result{}, unsignedRefused()
	case errors.Is(err, errNoPublicKey):
		ctx.Logf("no release key in this build: version %s placed without a signature check", staged.Version)
	case err != nil:
		return Result{}, unverifiable(err)
	default:
		signature, err := DecodeSignature(staged.Signature)
		if err != nil {
			return Result{}, unverifiable(err)
		}

		if !Verify(key, staged.Version, u.arch(), fingerprint, signature) {
			return Result{}, badSignature(staged.Version)
		}
	}

	unlock, err := hold(u.options.UpgradeLock, upgradeBusy)
	if err != nil {
		return Result{}, err
	}
	defer unlock()

	if err := u.holdTheFloor(ctx, Request{AllowDowngrade: staged.AllowDowngrade}, staged.Version, platform.State{}, errPushed); err != nil {
		return Result{}, err
	}

	ctx.Logf("version %s pushed, %d bytes, fingerprint %s", staged.Version, len(staged.Binary), fingerprint)

	return u.install(ctx, staged.Version, staged.Binary)
}
