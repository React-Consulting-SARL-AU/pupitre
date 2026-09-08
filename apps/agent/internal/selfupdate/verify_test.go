package selfupdate_test

import (
	"crypto/ed25519"
	"encoding/base64"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/selfupdate"
)

// The message the release pipeline has to sign, pinned here so the two sides cannot drift apart in silence.
func TestSignedMessageHasTheFormThePipelineSigns(t *testing.T) {
	message := string(selfupdate.SignedMessage("1.4.2", "amd64", strings.Repeat("ab", 32)))

	if message != "pupitred\n1.4.2\namd64\n"+strings.Repeat("ab", 32)+"\n" {
		t.Fatalf("signed message: %q", message)
	}
}

func TestFingerprintIsTheHexSha256(t *testing.T) {
	if got := selfupdate.Fingerprint([]byte("pupitred")); got != "a560bda2eb56f0090414c7528d83a19972fbe26b3c768144c8e99a242ffdf162" {
		t.Fatalf("empreinte = %s", got)
	}
}

func TestDecodeSignatureRefusesWhatIsNotAnEd25519Signature(t *testing.T) {
	for _, encoded := range []string{"", "not base64!", base64.StdEncoding.EncodeToString([]byte("trop court"))} {
		if _, err := selfupdate.DecodeSignature(encoded); err == nil {
			t.Fatalf("signature accepted: %q", encoded)
		}
	}
}

func TestDecodeSignatureAcceptsTheEncodingThePlatformStores(t *testing.T) {
	public, private, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("test key: %v", err)
	}

	encoded := base64.StdEncoding.EncodeToString(ed25519.Sign(private, selfupdate.SignedMessage("1.0.0", "arm64", "ab")))
	if len(encoded) != 88 {
		t.Fatalf("the stored signature is %d characters long", len(encoded))
	}

	signature, err := selfupdate.DecodeSignature(encoded)
	if err != nil {
		t.Fatalf("DecodeSignature: %v", err)
	}

	if !selfupdate.Verify(public, "1.0.0", "arm64", "ab", signature) {
		t.Fatal("the signature was not recognized")
	}
}

func TestParsePublicKeyRefusesAnythingButAnEd25519Key(t *testing.T) {
	for _, encoded := range []string{"", "not base64!", base64.StdEncoding.EncodeToString([]byte("trop court"))} {
		if _, err := selfupdate.ParsePublicKey(encoded); err == nil {
			t.Fatalf("key accepted: %q", encoded)
		}
	}
}

// Nothing is signed for a build that carries no key, so a release built without one refuses every upgrade rather than trusting it.
func TestEmbeddedPublicKeyIsAbsentUntilTheReleaseBuildSetsIt(t *testing.T) {
	if _, err := selfupdate.EmbeddedPublicKey(); err == nil {
		t.Fatal("a key is embedded in the test build")
	}
}
