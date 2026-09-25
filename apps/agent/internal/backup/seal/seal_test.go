package seal

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
)

type fixtures struct {
	KDF []struct {
		Passphrase string `json:"passphrase"`
		Normalized string `json:"normalized"`
		Salt       string `json:"salt"`
		Iterations int    `json:"iterations"`
		PrivateKey string `json:"private_key"`
		Recipient  string `json:"recipient"`
	} `json:"kdf"`
	Containers []struct {
		Name       string `json:"name"`
		PrivateKey string `json:"private_key"`
		Recipient  string `json:"recipient"`
		Ephemeral  string `json:"ephemeral_private_key"`
		Prefix     string `json:"nonce_prefix"`
		ChunkBytes int    `json:"chunk_bytes"`
		Plaintext  string `json:"plaintext"`
		Sealed     string `json:"sealed"`
	} `json:"containers"`
	Refusals []struct {
		Name       string `json:"name"`
		PrivateKey string `json:"private_key"`
		Sealed     string `json:"sealed"`
	} `json:"refusals"`
}

func load(t *testing.T) fixtures {
	t.Helper()

	raw, err := os.ReadFile(filepath.Join("..", "..", "contract", "backup.fixtures.json"))
	if err != nil {
		t.Fatal(err)
	}

	var loaded fixtures
	if err := json.Unmarshal(raw, &loaded); err != nil {
		t.Fatal(err)
	}

	return loaded
}

func decoded(t *testing.T, value string) []byte {
	t.Helper()

	raw, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		t.Fatal(err)
	}

	return raw
}

func TestThePassphraseDerivesTheIdentityOfTheLaptop(t *testing.T) {
	for _, vector := range load(t).KDF {
		normalized, err := Normalize(vector.Passphrase)
		if err != nil || normalized != vector.Normalized {
			t.Fatalf("%q normalised to %q (%v), want %q", vector.Passphrase, normalized, err, vector.Normalized)
		}

		identity, err := Derive(vector.Passphrase, vector.Salt, vector.Iterations)
		if err != nil {
			t.Fatal(err)
		}

		if got := base64.StdEncoding.EncodeToString(identity.PrivateKey); got != vector.PrivateKey {
			t.Fatalf("%q: private key %s, want %s", vector.Passphrase, got, vector.PrivateKey)
		}

		if identity.Recipient != vector.Recipient {
			t.Fatalf("%q: recipient %s, want %s", vector.Passphrase, identity.Recipient, vector.Recipient)
		}
	}
}

func TestADecomposedAccentComposesAsTheLaptopDoes(t *testing.T) {
	decomposed := string([]rune{'c', 'a', 'f', 'e', acute})

	composed, err := Normalize("  " + decomposed + " ")
	if err != nil || composed != string([]rune{'c', 'a', 'f', 0xE9}) {
		t.Fatalf("normalised to %q, %v", composed, err)
	}

	for _, passphrase := range [][]rune{
		{'q', acute},
		{acute, 'e'},
		{0x5E9, 0x5C1, 0x5DC},
		{0x915, 0x93F},
		{'a', 0x20DD},
	} {
		if _, err := Normalize(string(passphrase)); !errors.Is(err, ErrDecomposed) {
			t.Fatalf("%U: a mark the table does not compose must be refused, got %v", passphrase, err)
		}
	}
}

func TestSealingMatchesEveryVectorByteForByte(t *testing.T) {
	for _, vector := range load(t).Containers {
		t.Run(vector.Name, func(t *testing.T) {
			var out bytes.Buffer

			writer, err := NewWriter(&out, decoded(t, vector.Recipient), Options{
				EphemeralPrivateKey: decoded(t, vector.Ephemeral),
				NoncePrefix:         decoded(t, vector.Prefix),
				ChunkBytes:          vector.ChunkBytes,
			})
			if err != nil {
				t.Fatal(err)
			}

			plaintext := decoded(t, vector.Plaintext)

			for _, piece := range [][]byte{plaintext[:len(plaintext)/3], plaintext[len(plaintext)/3:]} {
				if _, err := writer.Write(piece); err != nil {
					t.Fatal(err)
				}
			}

			if err := writer.Close(); err != nil {
				t.Fatal(err)
			}

			if got := base64.StdEncoding.EncodeToString(out.Bytes()); got != vector.Sealed {
				t.Fatalf("sealed %s\nwant   %s", got, vector.Sealed)
			}

			opened := open(t, vector.Sealed, vector.PrivateKey)
			if !bytes.Equal(opened, plaintext) {
				t.Fatalf("opened %q, want %q", opened, plaintext)
			}
		})
	}
}

func open(t *testing.T, sealed, private string) []byte {
	t.Helper()

	reader, err := NewReader(bytes.NewReader(decoded(t, sealed)), decoded(t, private))
	if err != nil {
		t.Fatal(err)
	}

	opened, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}

	return opened
}

func TestEveryRefusalIsRefused(t *testing.T) {
	for _, vector := range load(t).Refusals {
		t.Run(vector.Name, func(t *testing.T) {
			reader, err := NewReader(bytes.NewReader(decoded(t, vector.Sealed)), decoded(t, vector.PrivateKey))
			if err == nil {
				_, err = io.ReadAll(reader)
			}

			if err == nil {
				t.Fatal("expected a refusal")
			}
		})
	}
}

func TestARealSealRoundTripsAcrossManyChunks(t *testing.T) {
	identity, err := Derive("correct horse battery staple", "lneDgZnxLTb17pcdSfaKvA==", 1000)
	if err != nil {
		t.Fatal(err)
	}

	recipient, err := DecodeKey(identity.Recipient)
	if err != nil {
		t.Fatal(err)
	}

	plaintext := bytes.Repeat([]byte("pupitre "), 40_000)

	var out bytes.Buffer
	writer, err := NewWriter(&out, recipient, Options{ChunkBytes: 4096})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := io.Copy(writer, bytes.NewReader(plaintext)); err != nil {
		t.Fatal(err)
	}

	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	reader, err := NewReader(&out, identity.PrivateKey)
	if err != nil {
		t.Fatal(err)
	}

	opened, err := io.ReadAll(reader)
	if err != nil || !bytes.Equal(opened, plaintext) {
		t.Fatalf("round trip lost the plaintext: %v", err)
	}
}

func TestAnotherKeyAndAForeignFileAreRefused(t *testing.T) {
	if _, err := NewReader(bytes.NewReader([]byte("not a backup at all, not even close to it, no no no")), make([]byte, 32)); !errors.Is(err, ErrNotABackup) {
		t.Fatalf("got %v, want ErrNotABackup", err)
	}

	if _, err := DecodeKey("c2hvcnQ="); !errors.Is(err, ErrKeySize) {
		t.Fatalf("got %v, want ErrKeySize", err)
	}
}
