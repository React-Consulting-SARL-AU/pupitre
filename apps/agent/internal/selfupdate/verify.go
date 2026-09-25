package selfupdate

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
)

// Binding version and arch refuses a genuine binary that is not the one asked for.
func SignedMessage(version, arch, fingerprint string) []byte {
	return []byte("pupitred\n" + version + "\n" + arch + "\n" + fingerprint + "\n")
}

func Fingerprint(binary []byte) string {
	digest := sha256.Sum256(binary)

	return hex.EncodeToString(digest[:])
}

func DecodeSignature(encoded string) ([]byte, error) {
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		raw, err = base64.RawStdEncoding.DecodeString(encoded)
	}

	if err != nil || len(raw) != ed25519.SignatureSize {
		return nil, errors.New("unreadable signature: a base64 Ed25519 signature is expected")
	}

	return raw, nil
}

func Verify(key ed25519.PublicKey, version, arch, fingerprint string, signature []byte) bool {
	return ed25519.Verify(key, SignedMessage(version, arch, fingerprint), signature)
}
