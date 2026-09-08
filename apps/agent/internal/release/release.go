// Package release signs the binaries the release chain publishes, and nothing of it is linked into pupitred.
package release

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"path"
	"regexp"
	"strings"
)

const (
	DefaultChannel = "beta"
	BinaryPrefix   = "pupitred-linux-"
	KeyPrefix      = "agent/"
	SignatureChars = 88
)

// The signer keeps its own copy of the signed message rather than calling the agent's: a witness test compares the two, so neither half can drift alone without turning red.
const messageName = "pupitred"

var Architectures = []string{"amd64", "arm64"}

var Channels = []string{"stable", "beta"}

var semver = regexp.MustCompile(`^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$`)

// Manifest is what the app reads alongside the binaries it embeds: the version it carries, and the per-architecture signature it will attach to an update for a server out of the platform's reach.
type Manifest struct {
	Version    string            `json:"version"`
	Notes      []string          `json:"notes"`
	Signatures map[string]string `json:"signatures"`
}

func ManifestOf(publications []Publication) (Manifest, error) {
	if len(publications) == 0 {
		return Manifest{}, errors.New("no publication: nothing to describe to the app")
	}

	manifest := Manifest{
		Version:    publications[0].Version,
		Notes:      []string{},
		Signatures: make(map[string]string, len(publications)),
	}

	for _, publication := range publications {
		if publication.Version != manifest.Version {
			return Manifest{}, fmt.Errorf("two versions in the same publication: %s and %s", manifest.Version, publication.Version)
		}

		manifest.Signatures[publication.Arch] = publication.Signature
	}

	return manifest, nil
}

// The body of POST /admin/releases, field for field.
type Publication struct {
	Version   string `json:"version"`
	Arch      string `json:"arch"`
	SHA256    string `json:"sha256"`
	Signature string `json:"signature"`
	R2Key     string `json:"r2_key"`
	Channel   string `json:"channel"`
}

func SignedMessage(version, arch, fingerprint string) []byte {
	return []byte(messageName + "\n" + version + "\n" + arch + "\n" + fingerprint + "\n")
}

func Fingerprint(binary []byte) string {
	digest := sha256.Sum256(binary)

	return hex.EncodeToString(digest[:])
}

func ObjectKey(version, arch string) string {
	return KeyPrefix + version + "/" + BinaryPrefix + arch
}

func Sign(private ed25519.PrivateKey, version, arch, channel string, binary []byte) (Publication, error) {
	if err := checkVersion(version); err != nil {
		return Publication{}, err
	}

	if err := checkArch(arch); err != nil {
		return Publication{}, err
	}

	channel, err := resolveChannel(channel)
	if err != nil {
		return Publication{}, err
	}

	if len(private) != ed25519.PrivateKeySize {
		return Publication{}, errors.New("unreadable signing key: a base64 Ed25519 private key is expected")
	}

	if len(binary) == 0 {
		return Publication{}, errors.New("empty binary: nothing to sign")
	}

	fingerprint := Fingerprint(binary)
	signature := ed25519.Sign(private, SignedMessage(version, arch, fingerprint))

	return Publication{
		Version:   version,
		Arch:      arch,
		SHA256:    fingerprint,
		Signature: base64.StdEncoding.EncodeToString(signature),
		R2Key:     ObjectKey(version, arch),
		Channel:   channel,
	}, nil
}

// The architecture comes from the file the build produced, so a binary can never be signed for a machine it was not compiled for.
func ArchOf(binaryPath string) (string, error) {
	name := path.Base(strings.ReplaceAll(binaryPath, "\\", "/"))

	arch, found := strings.CutPrefix(name, BinaryPrefix)
	if !found {
		return "", fmt.Errorf("%s: the expected name is %s<architecture>", name, BinaryPrefix)
	}

	if err := checkArch(arch); err != nil {
		return "", err
	}

	return arch, nil
}

func ParsePrivateKey(encoded string) (ed25519.PrivateKey, error) {
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(encoded))
	if err != nil || len(raw) != ed25519.PrivateKeySize {
		return nil, errors.New("unreadable signing key: a base64 Ed25519 private key is expected")
	}

	return ed25519.PrivateKey(raw), nil
}

func PublicKeyOf(private ed25519.PrivateKey) string {
	return base64.StdEncoding.EncodeToString(private.Public().(ed25519.PublicKey))
}

func GenerateKeyPair() (string, string, error) {
	public, private, err := ed25519.GenerateKey(nil)
	if err != nil {
		return "", "", err
	}

	return base64.StdEncoding.EncodeToString(public), base64.StdEncoding.EncodeToString(private), nil
}

func checkVersion(version string) error {
	if !semver.MatchString(version) {
		return fmt.Errorf("%q is not a semver version; the platform would refuse the publication", version)
	}

	return nil
}

func checkArch(arch string) error {
	for _, known := range Architectures {
		if arch == known {
			return nil
		}
	}

	return fmt.Errorf("unknown architecture: %q, expected %s", arch, strings.Join(Architectures, " or "))
}

func resolveChannel(channel string) (string, error) {
	if channel == "" {
		return DefaultChannel, nil
	}

	for _, known := range Channels {
		if channel == known {
			return channel, nil
		}
	}

	return "", fmt.Errorf("unknown channel: %q, expected %s", channel, strings.Join(Channels, " or "))
}
