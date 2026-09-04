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
		t.Fatalf("la chaîne de release signe %q", signed)
	}

	verified := selfupdate.SignedMessage("1.4.2", "amd64", fingerprint)
	if !bytes.Equal(signed, verified) {
		t.Fatalf("la chaîne signe %q et l'agent vérifie %q", signed, verified)
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
		t.Fatal("l'agent a refusé un binaire signé par la chaîne de release")
	}

	altered := bytes.Clone(binary)
	altered[7] ^= 1

	if selfupdate.Verify(public, publication.Version, publication.Arch, release.Fingerprint(altered), signature) {
		t.Fatal("l'agent a accepté un binaire modifié d'un octet")
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
		t.Error("la signature vaut pour une autre version")
	}

	if selfupdate.Verify(public, publication.Version, "arm64", publication.SHA256, signature) {
		t.Error("la signature vaut pour une autre architecture")
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
		t.Fatal("une clé étrangère a validé la signature")
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
		t.Errorf("clé R2 = %q", publication.R2Key)
	}

	if publication.Channel != "beta" {
		t.Errorf("canal par défaut = %q", publication.Channel)
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
		"version non semver":                     {"v1.4", "amd64", "", []byte("x")},
		"version vide":                           {"", "amd64", "", []byte("x")},
		"architecture rejetée par la plateforme": {"1.4.2", "riscv64", "", []byte("x")},
		"canal inconnu":                          {"1.4.2", "amd64", "nightly", []byte("x")},
		"binaire vide":                           {"1.4.2", "amd64", "", nil},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := release.Sign(private, tc.version, tc.arch, tc.channel, tc.binary); err == nil {
				t.Fatal("signature acceptée")
			}
		})
	}
}

func TestSignRefusesAKeyThatIsNotEd25519(t *testing.T) {
	if _, err := release.Sign(ed25519.PrivateKey("trop courte"), "1.4.2", "amd64", "", []byte("x")); err == nil {
		t.Fatal("clé acceptée")
	}
}

func TestArchOfReadsTheArchitectureFromTheBuiltFile(t *testing.T) {
	arch, err := release.ArchOf("dist/release/pupitred-linux-arm64")
	if err != nil || arch != "arm64" {
		t.Fatalf("arch = %q, err = %v", arch, err)
	}

	for _, path := range []string{"dist/release/pupitred", "dist/release/pupitred-linux-riscv64", "pupitred-darwin-arm64"} {
		if _, err := release.ArchOf(path); err == nil {
			t.Errorf("%s accepté", path)
		}
	}
}

func TestParsePrivateKeyRefusesAnythingElse(t *testing.T) {
	for _, encoded := range []string{"", "pas du base64 !", base64.StdEncoding.EncodeToString([]byte("trop courte"))} {
		if _, err := release.ParsePrivateKey(encoded); err == nil {
			t.Errorf("clé acceptée : %q", encoded)
		}
	}
}

// The public key the release build injects has to be the one the agent parses back out of its own binary.
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
		t.Fatal("la clé publique ne vient pas de la clé privée")
	}

	embedded, err := selfupdate.ParsePublicKey(public)
	if err != nil {
		t.Fatalf("l'agent refuse la clé publique : %v", err)
	}

	publication, err := release.Sign(parsed, "1.4.2", "amd64", "", []byte("pupitred"))
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	if !selfupdate.Verify(embedded, publication.Version, publication.Arch, publication.SHA256, decode(t, publication.Signature)) {
		t.Fatal("la signature n'a pas été reconnue par la clé embarquée")
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
