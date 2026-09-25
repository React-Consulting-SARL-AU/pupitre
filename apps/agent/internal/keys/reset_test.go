package keys_test

import (
	"errors"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/keys"
	"pupitre.studio/agent/internal/modules/modtest"
)

func TestAPublicKeyIsReadWithItsCommentDropped(t *testing.T) {
	loaded := fixtures(t)

	key, err := keys.ParsePublic("  " + loaded.Signers["ecdsa"] + " jordan@new-laptop\n")
	if err != nil || key.Bare() != loaded.Signers["ecdsa"] || key.Comment != "" {
		t.Fatalf("key = %+v, %v", key, err)
	}

	for _, line := range []string{
		`no-pty ` + loaded.Signers["ed25519"],
		loaded.Signers["ed25519"] + "\n" + loaded.Signers["other"],
		"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7 old",
		"ssh-ed25519",
		"",
	} {
		if _, err := keys.ParsePublic(line); !errors.Is(err, keys.ErrKeyRefused) {
			t.Errorf("%q: err = %v", line, err)
		}
	}
}

func TestResetLeavesOneKeyInTheBlockAndInTheTrust(t *testing.T) {
	loaded := fixtures(t)
	fake := modtest.NewFakeSys()
	ctx := modtest.NewSysContext(fake)

	fake.Files[keys.DefaultPath] = []byte("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFYbYqYFCzS+wnaB9G7NkFuFRPlBRbxJqcVJ0m8OvXKp own\n")
	keys.Sync(ctx, keys.Target{Path: keys.DefaultPath}, []keys.Key{approved(t, loaded.Signers["ed25519"]), approved(t, loaded.Signers["other"])})

	trust := keys.Trust{}
	trust.Add(approved(t, loaded.Signers["ed25519"]), keys.ViaOnboarding, issued)
	trust.Drop(approved(t, loaded.Signers["ed25519"]).Fingerprint(), issued)
	trust.Save(ctx, keys.DefaultSignersPath, issued)

	fresh := approved(t, loaded.Signers["ecdsa"])
	if err := keys.Reset(ctx, keys.Target{Path: keys.DefaultPath, Owner: "dev"}, keys.DefaultSignersPath, fresh, issued); err != nil {
		t.Fatal(err)
	}

	listed := keys.Listed(ctx, keys.DefaultPath)
	if len(listed) != 1 || listed[0].Bare() != fresh.Bare() {
		t.Fatalf("block = %+v", listed)
	}

	if !strings.Contains(string(fake.Files[keys.DefaultPath]), " own\n") {
		t.Fatalf("a line outside the block moved:\n%s", fake.Files[keys.DefaultPath])
	}

	if fake.Owners[keys.DefaultPath] != "dev:dev" || fake.Modes[keys.DefaultPath] != 0o600 {
		t.Fatalf("owner %q, mode %o", fake.Owners[keys.DefaultPath], fake.Modes[keys.DefaultPath])
	}

	after, err := keys.LoadTrust(fake, keys.DefaultSignersPath)
	if err != nil || len(after.Signers) != 1 || after.Signers[0].Via != keys.ViaReset || len(after.Removed) != 0 || !after.Trusts(fresh.Fingerprint()) {
		t.Fatalf("trust = %+v, %v", after, err)
	}
}
