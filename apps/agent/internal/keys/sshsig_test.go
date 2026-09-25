package keys_test

import (
	"bytes"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/keys"
)

func TestTheRealSignaturesVerify(t *testing.T) {
	loaded := fixtures(t)

	for name, signer := range map[string]string{"ed25519": "ed25519", "ed25519_sha256": "ed25519", "ecdsa": "ecdsa"} {
		t.Run(name, func(t *testing.T) {
			approval := loaded.Approvals[name]

			envelope, err := keys.VerifySignature(approval.Signature, keys.ApprovalNamespace, []byte(loaded.Message))
			if err != nil {
				t.Fatalf("verify: %v", err)
			}

			if !bytes.Equal(envelope.PublicKey, blobOf(t, loaded.Signers[signer])) {
				t.Fatal("the envelope carries another key than the signer's")
			}
		})
	}
}

func TestTheNamespaceAndTheHeaderAreTheContractOnes(t *testing.T) {
	loaded := fixtures(t)

	if !strings.HasPrefix(loaded.Message, keys.ApprovalHeader+"\n") {
		t.Fatalf("message = %q", loaded.Message)
	}

	for _, name := range []string{"ed25519", "ed25519_sha256", "ecdsa"} {
		approval := loaded.Approvals[name]

		if got := string(keys.ApprovalMessage(approval)); got != loaded.Message {
			t.Fatalf("%s: message = %q", name, got)
		}

		envelope, err := keys.ParseSignature(approval.Signature)
		if err != nil || envelope.Namespace != keys.ApprovalNamespace {
			t.Fatalf("%s: namespace = %q, %v", name, envelope.Namespace, err)
		}
	}
}

func TestASignatureForAnotherNamespaceIsRefused(t *testing.T) {
	loaded := fixtures(t)

	_, err := keys.VerifySignature(loaded.Approvals["wrong_namespace"].Signature, keys.ApprovalNamespace, []byte(loaded.Message))
	if !errors.Is(err, keys.ErrSignatureNamespace) {
		t.Fatalf("err = %v", err)
	}
}

func TestATamperedMessageOrSignatureDoesNotVerify(t *testing.T) {
	loaded := fixtures(t)

	for _, name := range []string{"ed25519", "ecdsa"} {
		signature := loaded.Approvals[name].Signature

		tampered := strings.Replace(loaded.Message, "user_id:X", "user_id:Y", 1)
		if _, err := keys.VerifySignature(signature, keys.ApprovalNamespace, []byte(tampered)); !errors.Is(err, keys.ErrSignatureInvalid) {
			t.Fatalf("%s, tampered message: %v", name, err)
		}

		flipped := split(t, signature)
		flipped.signature[len(flipped.signature)-1] ^= 1
		if _, err := keys.VerifySignature(flipped.armor(), keys.ApprovalNamespace, []byte(loaded.Message)); !errors.Is(err, keys.ErrSignatureInvalid) {
			t.Fatalf("%s, flipped bit: %v", name, err)
		}

		sha256 := split(t, signature)
		sha256.hash = []byte("sha256")
		if strings.Contains(name, "sha256") {
			sha256.hash = []byte("sha512")
		}
		if _, err := keys.VerifySignature(sha256.armor(), keys.ApprovalNamespace, []byte(loaded.Message)); !errors.Is(err, keys.ErrSignatureInvalid) {
			t.Fatalf("%s, another hash named: %v", name, err)
		}
	}
}

func TestAnEnvelopeOfTheWrongShapeIsUnreadable(t *testing.T) {
	loaded := fixtures(t)
	signature := loaded.Approvals["ed25519"].Signature

	trailing := split(t, signature)
	trailing.trailing = []byte{0}

	reserved := split(t, signature)
	reserved.reserved = []byte("x")

	extraSignatureField := split(t, signature)
	extraSignatureField.signature = append(extraSignatureField.signature, 0, 0, 0, 0)

	truncatedKey := split(t, signature)
	truncatedKey.publicKey = truncatedKey.publicKey[:len(truncatedKey.publicKey)-1]

	armored := strings.TrimSpace(signature)
	body := strings.TrimSuffix(strings.TrimPrefix(armored, "-----BEGIN SSH SIGNATURE-----\n"), "\n-----END SSH SIGNATURE-----")

	for name, candidate := range map[string]string{
		"trailing bytes":         trailing.armor(),
		"reserved not empty":     reserved.armor(),
		"extra signature bytes":  extraSignatureField.armor(),
		"truncated key":          truncatedKey.armor(),
		"truncated blob":         "-----BEGIN SSH SIGNATURE-----\n" + body[:40] + "\n-----END SSH SIGNATURE-----\n",
		"no armor":               body,
		"another armor":          "-----BEGIN OPENSSH PRIVATE KEY-----\n" + body + "\n-----END OPENSSH PRIVATE KEY-----\n",
		"not base64":             "-----BEGIN SSH SIGNATURE-----\n!!!!\n-----END SSH SIGNATURE-----\n",
		"another magic":          "-----BEGIN SSH SIGNATURE-----\nU1NIU0lI\n-----END SSH SIGNATURE-----\n",
		"empty":                  "",
		"version two":            strings.Replace(signature, "U1NIU0lHAAAAAQ", "U1NIU0lHAAAAAg", 1),
		"unreadable after magic": "-----BEGIN SSH SIGNATURE-----\nU1NIU0lHAAAA\n-----END SSH SIGNATURE-----\n",
	} {
		_, err := keys.VerifySignature(candidate, keys.ApprovalNamespace, []byte(loaded.Message))
		if !errors.Is(err, keys.ErrSignatureUnreadable) {
			t.Errorf("%s: err = %v", name, err)
		}
	}
}

func TestOnlySha512AndSha256AreAccepted(t *testing.T) {
	loaded := fixtures(t)

	other := split(t, loaded.Approvals["ed25519"].Signature)
	other.hash = []byte("sha384")

	if _, err := keys.VerifySignature(other.armor(), keys.ApprovalNamespace, []byte(loaded.Message)); !errors.Is(err, keys.ErrSignatureHash) {
		t.Fatalf("err = %v", err)
	}
}

func TestTheSignatureTypeMustBeTheKeyType(t *testing.T) {
	loaded := fixtures(t)

	mismatch := split(t, loaded.Approvals["ed25519"].Signature)
	fields := wireFields(mismatch.signature)
	mismatch.signature = joinWire([]byte("ecdsa-sha2-nistp256"), fields[1])

	if _, err := keys.VerifySignature(mismatch.armor(), keys.ApprovalNamespace, []byte(loaded.Message)); !errors.Is(err, keys.ErrSignatureInvalid) {
		t.Fatalf("err = %v", err)
	}
}

func TestAnECDSASignatureWithAPaddedIntegerIsRefused(t *testing.T) {
	loaded := fixtures(t)

	padded := split(t, loaded.Approvals["ecdsa"].Signature)
	outer := wireFields(padded.signature)
	integers := wireFields(outer[1])
	integers[0] = append([]byte{0}, integers[0]...)
	padded.signature = joinWire(outer[0], joinWire(integers...))

	if _, err := keys.VerifySignature(padded.armor(), keys.ApprovalNamespace, []byte(loaded.Message)); !errors.Is(err, keys.ErrSignatureInvalid) {
		t.Fatalf("err = %v", err)
	}
}

func TestRSADSAAndSecurityKeysAreRefused(t *testing.T) {
	loaded := fixtures(t)

	for _, keyType := range []string{"ssh-rsa", "ssh-dss", "sk-ssh-ed25519@openssh.com", "sk-ecdsa-sha2-nistp256@openssh.com", "ecdsa-sha2-nistp224"} {
		forged := split(t, loaded.Approvals["ed25519"].Signature)
		fields := wireFields(forged.publicKey)
		forged.publicKey = joinWire([]byte(keyType), fields[1])

		if _, err := keys.VerifySignature(forged.armor(), keys.ApprovalNamespace, []byte(loaded.Message)); !errors.Is(err, keys.ErrKeyUnsupported) {
			t.Errorf("%s: err = %v", keyType, err)
		}
	}
}

func TestSignaturesFromTheLocalSSHKeygenVerify(t *testing.T) {
	if _, err := exec.LookPath("ssh-keygen"); err != nil {
		t.Skip("ssh-keygen is not installed")
	}

	message := []byte(fixtures(t).Message)

	for _, kind := range []struct {
		name  string
		args  []string
		valid bool
	}{
		{"ecdsa-384", []string{"-t", "ecdsa", "-b", "384"}, true},
		{"ecdsa-521", []string{"-t", "ecdsa", "-b", "521"}, true},
		{"ed25519", []string{"-t", "ed25519"}, true},
		{"rsa", []string{"-t", "rsa", "-b", "2048"}, false},
	} {
		t.Run(kind.name, func(t *testing.T) {
			dir := t.TempDir()
			key := filepath.Join(dir, "id")
			data := filepath.Join(dir, "message")

			if out, err := exec.Command("ssh-keygen", append(kind.args, "-q", "-N", "", "-C", "", "-f", key)...).CombinedOutput(); err != nil {
				t.Skipf("ssh-keygen %v: %v %s", kind.args, err, out)
			}

			if err := os.WriteFile(data, message, 0o600); err != nil {
				t.Fatal(err)
			}

			if out, err := exec.Command("ssh-keygen", "-Y", "sign", "-q", "-f", key, "-n", keys.ApprovalNamespace, data).CombinedOutput(); err != nil {
				t.Skipf("ssh-keygen -Y sign: %v %s", err, out)
			}

			signature, _ := os.ReadFile(data + ".sig")
			public, _ := os.ReadFile(key + ".pub")

			envelope, err := keys.VerifySignature(string(signature), keys.ApprovalNamespace, message)
			if !kind.valid {
				if !errors.Is(err, keys.ErrKeyUnsupported) {
					t.Fatalf("err = %v", err)
				}

				return
			}

			if err != nil || !bytes.Equal(envelope.PublicKey, blobOf(t, string(public))) {
				t.Fatalf("verify: %v", err)
			}

			if _, err := keys.VerifySignature(string(signature), keys.ApprovalNamespace, append(message, '\n')); !errors.Is(err, keys.ErrSignatureInvalid) {
				t.Fatalf("a longer message verifies: %v", err)
			}
		})
	}
}
