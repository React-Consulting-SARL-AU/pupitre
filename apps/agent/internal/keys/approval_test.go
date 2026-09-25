package keys_test

import (
	"errors"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/keys"
)

const otherServer = "cz9y8x7w6v5u4t3s2r1q0p9o8"

func verifier(t *testing.T, loaded approvalFixtures, signers ...string) keys.Verifier {
	t.Helper()

	trusted := make([]keys.Key, 0, len(signers))
	for _, name := range signers {
		trusted = append(trusted, approved(t, loaded.Signers[name]))
	}

	return keys.Verifier{ServerID: loaded.Approvals["ed25519"].ServerID, Trusted: trusted, Now: issued.Add(time.Minute)}
}

func TestAnApprovalSignedByATrustedDeviceAdmitsItsKey(t *testing.T) {
	loaded := fixtures(t)

	for name, signer := range map[string]string{"ed25519": "ed25519", "ed25519_sha256": "ed25519", "ecdsa": "ecdsa"} {
		approval := loaded.Approvals[name]

		if err := verifier(t, loaded, signer).Admits(approved(t, approval.PublicKey), approval.UserID, approval); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func TestEveryRuleOfAnApprovalRefusesOnItsOwn(t *testing.T) {
	loaded := fixtures(t)
	approval := loaded.Approvals["ed25519"]
	key := approved(t, approval.PublicKey)
	other := approved(t, loaded.Signers["other"])

	cases := map[string]struct {
		verifier keys.Verifier
		key      keys.Key
		user     string
		approval contract.KeyApproval
		want     error
	}{}

	add := func(name string, want error, change func(*keys.Verifier, *keys.Key, *string, *contract.KeyApproval)) {
		v, k, u, a := verifier(t, loaded, "ed25519"), key, approval.UserID, approval
		change(&v, &k, &u, &a)
		cases[name] = struct {
			verifier keys.Verifier
			key      keys.Key
			user     string
			approval contract.KeyApproval
			want     error
		}{v, k, u, a, want}
	}

	add("another server", keys.ErrApprovalServer, func(v *keys.Verifier, _ *keys.Key, _ *string, _ *contract.KeyApproval) {
		v.ServerID = otherServer
	})
	add("no server id stored yet", keys.ErrApprovalServer, func(v *keys.Verifier, _ *keys.Key, _ *string, _ *contract.KeyApproval) {
		v.ServerID = ""
	})
	add("a stored id outside the pattern", keys.ErrApprovalShape, func(v *keys.Verifier, _ *keys.Key, _ *string, a *contract.KeyApproval) {
		v.ServerID, a.ServerID = "srv_42", "srv_42"
	})
	add("another key", keys.ErrApprovalKey, func(_ *keys.Verifier, k *keys.Key, _ *string, _ *contract.KeyApproval) {
		*k = other
	})
	add("another user", keys.ErrApprovalUser, func(_ *keys.Verifier, _ *keys.Key, u *string, _ *contract.KeyApproval) {
		*u = "someone-else"
	})
	add("a week and a second old", keys.ErrApprovalExpired, func(v *keys.Verifier, _ *keys.Key, _ *string, _ *contract.KeyApproval) {
		v.Now = issued.Add(7*24*time.Hour + time.Second)
	})
	add("dated past the skew", keys.ErrApprovalEarly, func(v *keys.Verifier, _ *keys.Key, _ *string, _ *contract.KeyApproval) {
		v.Now = issued.Add(-301 * time.Second)
	})
	add("signed by a key this server does not trust", keys.ErrApprovalSigner, func(v *keys.Verifier, _ *keys.Key, _ *string, _ *contract.KeyApproval) {
		v.Trusted = []keys.Key{other}
	})
	add("naming a trusted signer the signature is not from", keys.ErrApprovalSignerKey, func(v *keys.Verifier, _ *keys.Key, _ *string, a *contract.KeyApproval) {
		v.Trusted = []keys.Key{other}
		a.Signer = other.Fingerprint()
	})
	add("a field changed after signing", keys.ErrSignatureInvalid, func(_ *keys.Verifier, _ *keys.Key, u *string, a *contract.KeyApproval) {
		a.UserID = "Xq3v9LmN2pR7tY5wZ8aB1cD5"
		*u = a.UserID
	})
	add("a date changed after signing", keys.ErrSignatureInvalid, func(_ *keys.Verifier, _ *keys.Key, _ *string, a *contract.KeyApproval) {
		a.IssuedAt = "2026-09-25T10:00:01Z"
	})
	add("another namespace", keys.ErrSignatureNamespace, func(_ *keys.Verifier, _ *keys.Key, _ *string, a *contract.KeyApproval) {
		a.Signature = loaded.Approvals["wrong_namespace"].Signature
	})
	add("an issued_at spelled otherwise", keys.ErrApprovalShape, func(_ *keys.Verifier, _ *keys.Key, _ *string, a *contract.KeyApproval) {
		a.IssuedAt = "2026-09-25T10:00:00+00:00"
	})
	add("a key with its comment", keys.ErrApprovalShape, func(_ *keys.Verifier, _ *keys.Key, _ *string, a *contract.KeyApproval) {
		a.PublicKey += " jordan@laptop"
	})
	add("removed the second it was issued", keys.ErrApprovalAfterwards, func(v *keys.Verifier, _ *keys.Key, _ *string, _ *contract.KeyApproval) {
		v.Removed = func(string) (time.Time, bool) { return issued, true }
	})

	for name, tc := range cases {
		if err := tc.verifier.Admits(tc.key, tc.user, tc.approval); !errors.Is(err, tc.want) {
			t.Errorf("%s: err = %v, want %v", name, err, tc.want)
		}
	}
}

func TestTheWindowIncludesItsBounds(t *testing.T) {
	loaded := fixtures(t)
	approval := loaded.Approvals["ed25519"]
	key := approved(t, approval.PublicKey)

	for _, now := range []time.Time{issued.Add(7 * 24 * time.Hour), issued.Add(-300 * time.Second)} {
		v := verifier(t, loaded, "ed25519")
		v.Now = now

		if err := v.Admits(key, approval.UserID, approval); err != nil {
			t.Errorf("at %s: %v", now, err)
		}
	}
}

func TestAnApprovalIssuedAfterTheRemovalStillCounts(t *testing.T) {
	loaded := fixtures(t)
	approval := loaded.Approvals["ed25519"]

	v := verifier(t, loaded, "ed25519")
	v.Removed = func(fingerprint string) (time.Time, bool) {
		return issued.Add(-time.Second), fingerprint == approved(t, approval.PublicKey).Fingerprint()
	}

	if err := v.Admits(approved(t, approval.PublicKey), approval.UserID, approval); err != nil {
		t.Fatal(err)
	}
}

func TestOnlyABareAdmittedKeyIsRead(t *testing.T) {
	loaded := fixtures(t)
	ecdsaBody := loaded.Signers["ecdsa"][len("ecdsa-sha2-nistp256 "):]

	for _, line := range []string{
		loaded.Signers["ed25519"] + " comment",
		`command="true" ` + loaded.Signers["ed25519"],
		"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7",
		"sk-ssh-ed25519@openssh.com AAAAGnNrLXNzaC1lZDI1NTE5QG9wZW5zc2guY29tAAAAIBq",
		"ssh-ed25519 " + ecdsaBody,
		"ecdsa-sha2-nistp384 " + ecdsaBody,
		loaded.Signers["ed25519"] + "\n",
		loaded.Signers["ed25519"] + "\x00",
		"ssh-ed25519  " + loaded.Signers["ed25519"][len("ssh-ed25519 "):],
		"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIA==",
		"",
	} {
		if _, err := keys.ParseApproved(line); !errors.Is(err, keys.ErrKeyRefused) {
			t.Errorf("%q: err = %v", line, err)
		}
	}

	for _, name := range []string{"ed25519", "ecdsa", "other"} {
		key := approved(t, loaded.Signers[name])
		if key.Bare() != loaded.Signers[name] || key.Options != "" || key.Comment != "" {
			t.Errorf("%s: %+v", name, key)
		}
	}
}

func TestTheServerIDFollowsTheContract(t *testing.T) {
	if !keys.ValidServerID("cm0k2x9q80000a1b2c3d4e5f6") || keys.ValidServerID("srv_42") || keys.ValidServerID("") {
		t.Fatal("the server id pattern is not the contract's")
	}
}
