package selfupdate

import (
	"errors"

	"pupitre.studio/agent/internal/platform"
)

// A binary the app pushed over SSH, which is how a server reached as dev gets a new agent without a shell as root.
type Staged struct {
	Version        string
	Signature      string
	Binary         []byte
	AllowDowngrade bool
	// Privileged says sudo asked for the password: `pupitred binary install` with nothing else is the line it runs without one.
	Privileged bool
}

var errPushed = errors.New("a pushed binary is not asked of the platform")

// Place holds a pushed binary to what an upgrade holds a downloaded one: the embedded key signs this version, this architecture and these bytes, and the running version is the floor.
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
