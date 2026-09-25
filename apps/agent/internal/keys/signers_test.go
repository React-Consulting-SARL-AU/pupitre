package keys_test

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/keys"
	"pupitre.studio/agent/internal/modules/modtest"
)

func TestAnAbsentStoreTrustsNobody(t *testing.T) {
	trust, err := keys.LoadTrust(modtest.NewFakeSys(), keys.DefaultSignersPath)
	if err != nil || len(trust.Keys()) != 0 || len(trust.Fingerprints()) != 0 {
		t.Fatalf("trust = %+v, err = %v", trust, err)
	}
}

func TestAnUnreadableStoreIsAnErrorNotAnEmptySet(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[keys.DefaultSignersPath] = []byte("{not json")

	if _, err := keys.LoadTrust(fake, keys.DefaultSignersPath); err == nil {
		t.Fatal("a corrupt store read as an empty one")
	}
}

func TestTheStoreIsWrittenForRootAloneAndReadBack(t *testing.T) {
	loaded := fixtures(t)
	fake := modtest.NewFakeSys()
	ctx := modtest.NewSysContext(fake)

	trust := keys.Trust{}
	if !trust.Add(approved(t, loaded.Signers["ed25519"]), keys.ViaOnboarding, issued) {
		t.Fatal("a new key is not added")
	}
	if trust.Add(approved(t, loaded.Signers["ed25519"]), keys.ViaApproval, issued.Add(time.Hour)) {
		t.Fatal("a trusted key is added twice")
	}

	if err := trust.Save(ctx, keys.DefaultSignersPath, issued); err != nil {
		t.Fatal(err)
	}

	if fake.Modes[keys.DefaultSignersPath] != 0o600 {
		t.Fatalf("mode = %o", fake.Modes[keys.DefaultSignersPath])
	}

	var raw map[string]any
	if err := json.Unmarshal(fake.Files[keys.DefaultSignersPath], &raw); err != nil {
		t.Fatal(err)
	}

	signers := raw["signers"].([]any)
	first := signers[0].(map[string]any)
	if len(signers) != 1 || first["public_key"] != loaded.Signers["ed25519"] || first["via"] != "onboarding" || first["since"] != "2026-09-25T10:00:00Z" {
		t.Fatalf("stored = %s", fake.Files[keys.DefaultSignersPath])
	}

	if removed, listed := raw["removed"].([]any); !listed || len(removed) != 0 {
		t.Fatalf("removed must be an empty list: %s", fake.Files[keys.DefaultSignersPath])
	}

	back, err := keys.LoadTrust(fake, keys.DefaultSignersPath)
	if err != nil || !back.Trusts(approved(t, loaded.Signers["ed25519"]).Fingerprint()) {
		t.Fatalf("back = %+v, %v", back, err)
	}
}

func TestADroppedKeyLeavesATombstoneThatALaterSSHGestureClears(t *testing.T) {
	loaded := fixtures(t)
	key := approved(t, loaded.Signers["ecdsa"])

	trust := keys.Trust{}
	trust.Add(key, keys.ViaMigration, issued)

	if !trust.Drop(key.Fingerprint(), issued.Add(time.Hour)) || trust.Trusts(key.Fingerprint()) {
		t.Fatalf("trust = %+v", trust)
	}

	if at, gone := trust.RemovedAt(key.Fingerprint()); !gone || !at.Equal(issued.Add(time.Hour)) {
		t.Fatalf("removed at %s, %v", at, gone)
	}

	if trust.Drop(key.Fingerprint(), issued.Add(2*time.Hour)) {
		t.Fatal("a key already gone is dropped twice")
	}

	if !trust.Forgive(key.Fingerprint()) {
		t.Fatal("the tombstone is not cleared")
	}

	if _, gone := trust.RemovedAt(key.Fingerprint()); gone {
		t.Fatal("the tombstone outlives the gesture")
	}
}

func TestTombstonesOlderThanAnyApprovalArePrunedOnWrite(t *testing.T) {
	fake := modtest.NewFakeSys()

	trust := keys.Trust{Removed: []keys.Removal{
		{Fingerprint: "SHA256:old", At: "2026-09-01T00:00:00Z"},
		{Fingerprint: "SHA256:recent", At: "2026-09-24T00:00:00Z"},
		{Fingerprint: "SHA256:unreadable", At: "yesterday"},
	}}

	if err := trust.Save(modtest.NewSysContext(fake), keys.DefaultSignersPath, issued); err != nil {
		t.Fatal(err)
	}

	stored := string(fake.Files[keys.DefaultSignersPath])
	if strings.Contains(stored, "SHA256:old") || strings.Contains(stored, "unreadable") || !strings.Contains(stored, "SHA256:recent") {
		t.Fatalf("stored = %s", stored)
	}
}

func TestAStoredKeyThatIsNotAnAdmittedOneIsNotTrusted(t *testing.T) {
	loaded := fixtures(t)
	fake := modtest.NewFakeSys()
	fake.Files[keys.DefaultSignersPath] = []byte(`{"signers":[
		{"public_key":"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7","via":"migration","since":"2026-09-25T10:00:00Z"},
		{"public_key":"` + loaded.Signers["other"] + ` comment","via":"migration","since":"2026-09-25T10:00:00Z"},
		{"public_key":"` + loaded.Signers["ed25519"] + `","via":"migration","since":"2026-09-25T10:00:00Z"}
	],"removed":[]}`)

	trust, err := keys.LoadTrust(fake, keys.DefaultSignersPath)
	if err != nil || len(trust.Signers) != 1 || len(trust.Keys()) != 1 {
		t.Fatalf("trust = %+v, %v", trust, err)
	}
}
