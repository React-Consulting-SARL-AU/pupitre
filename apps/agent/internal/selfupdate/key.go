package selfupdate

import (
	"crypto/ed25519"
	"encoding/base64"
	"errors"
)

// Set at link time by the release build: -ldflags "-X pupitre.studio/agent/internal/selfupdate.releasePublicKey=<base64>".
var releasePublicKey = ""

var errNoPublicKey = errors.New("no signing key is embedded in this agent")

func EmbeddedPublicKey() (ed25519.PublicKey, error) {
	return ParsePublicKey(releasePublicKey)
}

func ParsePublicKey(encoded string) (ed25519.PublicKey, error) {
	if encoded == "" {
		return nil, errNoPublicKey
	}

	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(raw) != ed25519.PublicKeySize {
		return nil, errors.New("the embedded signing key is unreadable")
	}

	return ed25519.PublicKey(raw), nil
}
