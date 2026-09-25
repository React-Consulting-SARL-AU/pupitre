// Mirrors packages/shared/src/backup/crypto.ts; both are held to contract/backup.fixtures.json.
package seal

import (
	"crypto/ecdh"
	"crypto/pbkdf2"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"unicode"

	"pupitre.studio/agent/internal/contract"
)

const keyBytes = 32

var (
	ErrKeySize    = errors.New("a backup key is 32 bytes, base64")
	ErrDecomposed = errors.New("the passphrase holds a combining mark this tool cannot compose")
)

type Identity struct {
	PrivateKey []byte
	Recipient  string
}

func Derive(passphrase, salt string, iterations int) (Identity, error) {
	normalized, err := Normalize(passphrase)
	if err != nil {
		return Identity{}, err
	}

	rawSalt, err := base64.StdEncoding.DecodeString(salt)
	if err != nil {
		return Identity{}, fmt.Errorf("salt: %w", err)
	}

	private, err := pbkdf2.Key(sha256.New, normalized, rawSalt, iterations, contract.Backup.KDF.KeyBytes)
	if err != nil {
		return Identity{}, err
	}

	recipient, err := RecipientOf(private)
	if err != nil {
		return Identity{}, err
	}

	return Identity{PrivateKey: private, Recipient: recipient}, nil
}

func RecipientOf(private []byte) (string, error) {
	key, err := ecdh.X25519().NewPrivateKey(private)
	if err != nil {
		return "", ErrKeySize
	}

	return base64.StdEncoding.EncodeToString(key.PublicKey().Bytes()), nil
}

func DecodeKey(encoded string) ([]byte, error) {
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(encoded))
	if err != nil || len(raw) != keyBytes {
		return nil, ErrKeySize
	}

	return raw, nil
}

// No NFC in the standard library: Latin accents are composed here, other marks refused rather than yield a wrong key.
func Normalize(passphrase string) (string, error) {
	runes := []rune(strings.TrimSpace(passphrase))
	composed := make([]rune, 0, len(runes))

	for _, current := range runes {
		if !unicode.Is(unicode.M, current) {
			composed = append(composed, current)

			continue
		}

		last := len(composed) - 1
		if last < 0 {
			return "", ErrDecomposed
		}

		merged, known := compositions[[2]rune{composed[last], current}]
		if !known {
			return "", ErrDecomposed
		}

		composed[last] = merged
	}

	return string(composed), nil
}

const (
	grave      = 0x300
	acute      = 0x301
	circumflex = 0x302
	tilde      = 0x303
	diaeresis  = 0x308
	ring       = 0x30A
	caron      = 0x30C
	cedilla    = 0x327
)

var compositions = map[[2]rune]rune{
	{'A', grave}: 0xC0, {'E', grave}: 0xC8, {'I', grave}: 0xCC, {'O', grave}: 0xD2, {'U', grave}: 0xD9,
	{'a', grave}: 0xE0, {'e', grave}: 0xE8, {'i', grave}: 0xEC, {'o', grave}: 0xF2, {'u', grave}: 0xF9,

	{'A', acute}: 0xC1, {'E', acute}: 0xC9, {'I', acute}: 0xCD, {'O', acute}: 0xD3, {'U', acute}: 0xDA, {'Y', acute}: 0xDD,
	{'a', acute}: 0xE1, {'e', acute}: 0xE9, {'i', acute}: 0xED, {'o', acute}: 0xF3, {'u', acute}: 0xFA, {'y', acute}: 0xFD,
	{'C', acute}: 0x106, {'c', acute}: 0x107, {'N', acute}: 0x143, {'n', acute}: 0x144,
	{'S', acute}: 0x15A, {'s', acute}: 0x15B, {'Z', acute}: 0x179, {'z', acute}: 0x17A,

	{'A', circumflex}: 0xC2, {'E', circumflex}: 0xCA, {'I', circumflex}: 0xCE, {'O', circumflex}: 0xD4, {'U', circumflex}: 0xDB,
	{'a', circumflex}: 0xE2, {'e', circumflex}: 0xEA, {'i', circumflex}: 0xEE, {'o', circumflex}: 0xF4, {'u', circumflex}: 0xFB,

	{'A', tilde}: 0xC3, {'N', tilde}: 0xD1, {'O', tilde}: 0xD5, {'a', tilde}: 0xE3, {'n', tilde}: 0xF1, {'o', tilde}: 0xF5,

	{'A', diaeresis}: 0xC4, {'E', diaeresis}: 0xCB, {'I', diaeresis}: 0xCF, {'O', diaeresis}: 0xD6, {'U', diaeresis}: 0xDC, {'Y', diaeresis}: 0x178,
	{'a', diaeresis}: 0xE4, {'e', diaeresis}: 0xEB, {'i', diaeresis}: 0xEF, {'o', diaeresis}: 0xF6, {'u', diaeresis}: 0xFC, {'y', diaeresis}: 0xFF,

	{'A', ring}: 0xC5, {'a', ring}: 0xE5, {'U', ring}: 0x16E, {'u', ring}: 0x16F,

	{'C', cedilla}: 0xC7, {'c', cedilla}: 0xE7,

	{'C', caron}: 0x10C, {'c', caron}: 0x10D, {'E', caron}: 0x11A, {'e', caron}: 0x11B, {'R', caron}: 0x158, {'r', caron}: 0x159,
	{'S', caron}: 0x160, {'s', caron}: 0x161, {'Z', caron}: 0x17D, {'z', caron}: 0x17E,
}
