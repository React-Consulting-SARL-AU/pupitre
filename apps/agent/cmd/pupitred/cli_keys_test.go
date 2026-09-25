package main

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/keys"
	"pupitre.studio/agent/internal/modules/modtest"
)

const (
	recoveryKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIIpnKVP1oHEgOAeBppA7YR+8vwKg5ylIyTLxWKT7IaS"
	lostKey     = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIENlOFb5hxF0oFkVQCgkbg4qecOj0Pcmp6swLrfuSE31"
	clientKey   = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFYbYqYFCzS+wnaB9G7NkFuFRPlBRbxJqcVJ0m8OvXKp own"
)

func setupKeys(t *testing.T, uid int) *modtest.FakeSys {
	t.Helper()

	fake, _ := setupCLI(t)

	previous := effectiveUID
	effectiveUID = func() int { return uid }
	t.Cleanup(func() { effectiveUID = previous })

	fake.Files[keys.DefaultPath] = []byte(clientKey + "\n# >>> pupitre keys >>>\n" + lostKey + " jordan@lost\n# <<< pupitre keys <<<\n")
	fake.Files[keys.DefaultSignersPath] = []byte(`{"signers":[{"public_key":"` + lostKey + `","via":"onboarding","since":"2026-09-20T10:00:00Z"}],"removed":[{"fingerprint":"SHA256:x","at":"2026-09-24T10:00:00Z"}]}`)

	return fake
}

func TestKeysResetLeavesTheOneKeyItIsGiven(t *testing.T) {
	fake := setupKeys(t, 0)

	code, stdout, stderr := runCLI(t, "keys", "reset", "--key", recoveryKey+" jordan@new-laptop")
	if code != 0 {
		t.Fatalf("code = %d, stderr = %q", code, stderr)
	}

	authorized := string(fake.Files[keys.DefaultPath])
	if !strings.Contains(authorized, recoveryKey+"\n") || strings.Contains(authorized, lostKey) || strings.Contains(authorized, "new-laptop") || !strings.HasPrefix(authorized, clientKey+"\n") {
		t.Fatalf("authorized_keys:\n%s", authorized)
	}

	if fake.Owners[keys.DefaultPath] != "dev:dev" || fake.Modes[keys.DefaultPath] != 0o600 {
		t.Fatalf("owner %q, mode %o", fake.Owners[keys.DefaultPath], fake.Modes[keys.DefaultPath])
	}

	trust, err := keys.LoadTrust(fake, keys.DefaultSignersPath)
	recovered, _ := keys.ParseApproved(recoveryKey)
	if err != nil || len(trust.Signers) != 1 || trust.Signers[0].Via != keys.ViaReset || len(trust.Removed) != 0 || !trust.Trusts(recovered.Fingerprint()) {
		t.Fatalf("trust = %+v, %v", trust, err)
	}

	if !strings.Contains(stdout, recovered.Fingerprint()) || !strings.Contains(stdout, "onboarding") {
		t.Fatalf("stdout = %q", stdout)
	}

	lines := serveOn(t,
		`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":2}}`,
		`{"id":2,"cmd":"keys.list","params":{}}`,
	)
	if !strings.Contains(lines[len(lines)-1], `"signer":true`) || !strings.Contains(lines[len(lines)-1], recovered.Fingerprint()) {
		t.Fatalf("keys.list = %s", lines[len(lines)-1])
	}
}

func TestKeysResetReadsAPubFile(t *testing.T) {
	fake := setupKeys(t, 0)
	fake.Files["/root/new-laptop.pub"] = []byte(recoveryKey + " jordan@new-laptop\n")

	if code, _, stderr := runCLI(t, "keys", "reset", "--key=/root/new-laptop.pub"); code != 0 {
		t.Fatalf("code = %d, stderr = %q", code, stderr)
	}

	if !strings.Contains(string(fake.Files[keys.DefaultPath]), recoveryKey+"\n") {
		t.Fatalf("authorized_keys:\n%s", fake.Files[keys.DefaultPath])
	}
}

func TestKeysResetRefusesWithoutRoot(t *testing.T) {
	fake := setupKeys(t, 1000)
	before := string(fake.Files[keys.DefaultPath])

	code, _, stderr := runCLI(t, "keys", "reset", "--key", recoveryKey)
	if code != 1 || !strings.Contains(stderr, "sudo pupitred keys reset") {
		t.Fatalf("code = %d, stderr = %q", code, stderr)
	}

	if string(fake.Files[keys.DefaultPath]) != before {
		t.Fatal("a refused reset wrote the block")
	}
}

func TestKeysResetRefusesWhatCannotOpenTheServer(t *testing.T) {
	fake := setupKeys(t, 0)
	before := string(fake.Files[keys.DefaultPath])

	for _, offered := range []string{
		"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7 old",
		`command="/bin/sh" ` + recoveryKey,
		"/root/absent.pub",
	} {
		if code, _, stderr := runCLI(t, "keys", "reset", "--key", offered); code != 1 || stderr == "" {
			t.Errorf("%s: code = %d, stderr = %q", offered, code, stderr)
		}
	}

	if string(fake.Files[keys.DefaultPath]) != before {
		t.Fatal("a refused key reached the block")
	}
}

func TestKeysResetSaysHowItIsUsed(t *testing.T) {
	setupKeys(t, 0)

	for _, args := range [][]string{{"keys"}, {"keys", "list"}, {"keys", "reset"}, {"keys", "reset", "--key"}, {"keys", "reset", "--force", "--key", recoveryKey}} {
		if code, _, stderr := runCLI(t, args...); code != 2 || !strings.Contains(stderr, "usage: sudo pupitred keys reset") {
			t.Errorf("%v: code = %d, stderr = %q", args, code, stderr)
		}
	}
}
