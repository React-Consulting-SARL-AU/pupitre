package release_test

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"regexp"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/release"
	"pupitre.studio/agent/internal/selfupdate"
)

// The pattern POST /admin/releases enforces on the signature it stores.
var storedSignature = regexp.MustCompile(`^[A-Za-z0-9+/]{86}==$`)

var fingerprint = strings.Repeat("ab", 32)

func TestTheSignedMessageIsTheOneTheContractRatified(t *testing.T) {
	golden := "pupitred\n1.4.2\namd64\n" + fingerprint + "\n"

	signed := release.SignedMessage("1.4.2", "amd64", fingerprint)
	if string(signed) != golden {
		t.Fatalf("the release chain signs %q", signed)
	}

	verified := selfupdate.SignedMessage("1.4.2", "amd64", fingerprint)
	if !bytes.Equal(signed, verified) {
		t.Fatalf("the chain signs %q and the agent verifies %q", signed, verified)
	}
}

func TestTheFingerprintIsTheOneTheAgentComputes(t *testing.T) {
	binary := []byte("un binaire")

	if release.Fingerprint(binary) != selfupdate.Fingerprint(binary) {
		t.Fatalf("empreinte %s, l'agent calcule %s", release.Fingerprint(binary), selfupdate.Fingerprint(binary))
	}
}

func TestASignedBinaryIsAcceptedByTheAgentAndOneAlteredByteIsNot(t *testing.T) {
	public, private := keyPair(t)
	binary := []byte("pupitred, tout un binaire de release")

	publication, err := release.Sign(private, "1.4.2", "amd64", "stable", binary)
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	signature := decode(t, publication.Signature)

	if !selfupdate.Verify(public, publication.Version, publication.Arch, publication.SHA256, signature) {
		t.Fatal("the agent refused a binary signed by the release chain")
	}

	altered := bytes.Clone(binary)
	altered[7] ^= 1

	if selfupdate.Verify(public, publication.Version, publication.Arch, release.Fingerprint(altered), signature) {
		t.Fatal("the agent accepted a binary altered by one byte")
	}
}

func TestTheSignatureDoesNotTravelToAnotherVersionOrArchitecture(t *testing.T) {
	public, private := keyPair(t)
	binary := []byte("pupitred")

	publication, err := release.Sign(private, "1.4.2", "amd64", "", binary)
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	signature := decode(t, publication.Signature)

	if selfupdate.Verify(public, "1.4.3", publication.Arch, publication.SHA256, signature) {
		t.Error("the signature holds for another version")
	}

	if selfupdate.Verify(public, publication.Version, "arm64", publication.SHA256, signature) {
		t.Error("the signature holds for another architecture")
	}
}

func TestAnotherKeyIsRefused(t *testing.T) {
	_, private := keyPair(t)
	other, _ := keyPair(t)

	publication, err := release.Sign(private, "1.4.2", "arm64", "", []byte("pupitred"))
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	if selfupdate.Verify(other, publication.Version, publication.Arch, publication.SHA256, decode(t, publication.Signature)) {
		t.Fatal("a foreign key validated the signature")
	}
}

func TestThePublicationIsWhatThePlatformAccepts(t *testing.T) {
	_, private := keyPair(t)

	publication, err := release.Sign(private, "1.4.2", "arm64", "", []byte("pupitred"))
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	if !storedSignature.MatchString(publication.Signature) {
		t.Errorf("signature = %q", publication.Signature)
	}

	if len(publication.SHA256) != 64 || strings.ToLower(publication.SHA256) != publication.SHA256 {
		t.Errorf("empreinte = %q", publication.SHA256)
	}

	if publication.R2Key != "agent/1.4.2/pupitred-linux-arm64" {
		t.Errorf("R2 key = %q", publication.R2Key)
	}

	if publication.Channel != "beta" {
		t.Errorf("default channel = %q", publication.Channel)
	}
}

func TestSignRefusesWhatThePlatformWouldRefuseToo(t *testing.T) {
	_, private := keyPair(t)

	cases := map[string]struct {
		version string
		arch    string
		channel string
		binary  []byte
	}{
		"non-semver version":                   {"v1.4", "amd64", "", []byte("x")},
		"empty version":                        {"", "amd64", "", []byte("x")},
		"architecture refused by the platform": {"1.4.2", "riscv64", "", []byte("x")},
		"unknown channel":                      {"1.4.2", "amd64", "nightly", []byte("x")},
		"empty binary":                         {"1.4.2", "amd64", "", nil},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := release.Sign(private, tc.version, tc.arch, tc.channel, tc.binary); err == nil {
				t.Fatal("signature accepted")
			}
		})
	}
}

func TestSignRefusesAKeyThatIsNotEd25519(t *testing.T) {
	if _, err := release.Sign(ed25519.PrivateKey("trop courte"), "1.4.2", "amd64", "", []byte("x")); err == nil {
		t.Fatal("key accepted")
	}
}

func TestArchOfReadsTheArchitectureFromTheBuiltFile(t *testing.T) {
	arch, err := release.ArchOf("dist/release/pupitred-linux-arm64")
	if err != nil || arch != "arm64" {
		t.Fatalf("arch = %q, err = %v", arch, err)
	}

	for _, path := range []string{"dist/release/pupitred", "dist/release/pupitred-linux-riscv64", "pupitred-darwin-arm64"} {
		if _, err := release.ArchOf(path); err == nil {
			t.Errorf("%s accepted", path)
		}
	}
}

func TestParsePrivateKeyRefusesAnythingElse(t *testing.T) {
	for _, encoded := range []string{"", "not base64!", base64.StdEncoding.EncodeToString([]byte("trop courte"))} {
		if _, err := release.ParsePrivateKey(encoded); err == nil {
			t.Errorf("key accepted: %q", encoded)
		}
	}
}

func TestTheGeneratedPairFeedsTheLinkerFlagTheAgentReads(t *testing.T) {
	public, private, err := release.GenerateKeyPair()
	if err != nil {
		t.Fatalf("GenerateKeyPair: %v", err)
	}

	parsed, err := release.ParsePrivateKey(private)
	if err != nil {
		t.Fatalf("ParsePrivateKey: %v", err)
	}

	if release.PublicKeyOf(parsed) != public {
		t.Fatal("the public key does not come from the private key")
	}

	embedded, err := selfupdate.ParsePublicKey(public)
	if err != nil {
		t.Fatalf("the agent refuses the public key: %v", err)
	}

	publication, err := release.Sign(parsed, "1.4.2", "amd64", "", []byte("pupitred"))
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	if !selfupdate.Verify(embedded, publication.Version, publication.Arch, publication.SHA256, decode(t, publication.Signature)) {
		t.Fatal("the signature was not recognized by the embedded key")
	}
}

func keyPair(t *testing.T) (ed25519.PublicKey, ed25519.PrivateKey) {
	t.Helper()

	public, private, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("paire de test : %v", err)
	}

	return public, private
}

func decode(t *testing.T, encoded string) []byte {
	t.Helper()

	signature, err := selfupdate.DecodeSignature(encoded)
	if err != nil {
		t.Fatalf("DecodeSignature: %v", err)
	}

	return signature
}

func TestManifestOfDescribesWhatTheAppCarries(t *testing.T) {
	publications := []release.Publication{
		{Version: "1.4.0", Arch: "amd64", Signature: "sig-amd64"},
		{Version: "1.4.0", Arch: "arm64", Signature: "sig-arm64"},
	}

	manifest, err := release.ManifestOf(publications)
	if err != nil {
		t.Fatalf("ManifestOf: %v", err)
	}

	if manifest.Version != "1.4.0" {
		t.Fatalf("version %q, want 1.4.0", manifest.Version)
	}

	if manifest.Signatures["arm64"] != "sig-arm64" {
		t.Fatalf("signature arm64 %q", manifest.Signatures["arm64"])
	}
}

func TestManifestOfRefusesTwoVersionsAtOnce(t *testing.T) {
	_, err := release.ManifestOf([]release.Publication{
		{Version: "1.4.0", Arch: "amd64"},
		{Version: "1.5.0", Arch: "arm64"},
	})
	if err == nil {
		t.Fatal("two versions in the same publication accepted")
	}

	if _, err := release.ManifestOf(nil); err == nil {
		t.Fatal("empty publication accepted")
	}
}
