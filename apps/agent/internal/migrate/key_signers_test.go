package migrate_test

import (
	"encoding/json"
	"testing"

	sshkeys "pupitre.studio/agent/internal/keys"
	"pupitre.studio/agent/internal/migrate"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	signersPath = "/etc/pupitre/signers.json"
	laptopKey   = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIIpnKVP1oHEgOAeBppA7YR+8vwKg5ylIyTLxWKT7IaS"
	ecdsaKey    = "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBNH5F8J50Xgsj+WzK4rJlQktX5PrBNTPY3qWAXqzpfdCVu0jyBMPMYXiiNXEKaKpAhcqV3CKKAS1HTNag6sqX9s="
	optioned    = `command="/usr/bin/true" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIENlOFb5hxF0oFkVQCgkbg4qecOj0Pcmp6swLrfuSE31 held-back`
	rsaKey      = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7 old-laptop"
	outsideKey  = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFYbYqYFCzS+wnaB9G7NkFuFRPlBRbxJqcVJ0m8OvXKp own"
)

func keySigners() migrate.Migration {
	for _, migration := range migrate.All() {
		if migration.ID == 6 {
			return migration
		}
	}

	panic("no migration 6")
}

func withBlock(machine *modtest.FakeSys, lines ...string) {
	content := outsideKey + "\n# >>> pupitre keys >>>\n"
	for _, line := range lines {
		content += line + "\n"
	}

	machine.Files[sshkeys.DefaultPath] = []byte(content + "# <<< pupitre keys <<<\n")
}

func TestKeySignersSeedsTheKeysOfTheBlockThatCanSign(t *testing.T) {
	machine := newSys()
	configured(machine)
	withBlock(machine, laptopKey+" jordan@laptop", ecdsaKey, optioned, rsaKey, laptopKey+" twice")

	if _, found := file.BlockOf(machine.Files[sshkeys.DefaultPath], sshkeys.Block); !found {
		t.Fatalf("the fixture has no managed block:\n%s", machine.Files[sshkeys.DefaultPath])
	}

	migration := keySigners()
	if migration.Slug != "key-signers" || migration.Since != "0.10.0" || len(migration.Touches) != 1 || migration.Touches[0] != migrate.TargetSigners {
		t.Fatalf("migration = %+v", migration)
	}

	result, err := runner(machine, migration).Run()
	if err != nil || result.Failure != nil || len(result.Applied) != 1 {
		t.Fatalf("result = %+v, err = %v", result, err)
	}

	var stored struct {
		Signers []map[string]string `json:"signers"`
		Removed []any               `json:"removed"`
	}
	if err := json.Unmarshal(machine.Files[signersPath], &stored); err != nil {
		t.Fatalf("%v: %s", err, machine.Files[signersPath])
	}

	if len(stored.Signers) != 2 || stored.Signers[0]["public_key"] != laptopKey || stored.Signers[1]["public_key"] != ecdsaKey || stored.Removed == nil {
		t.Fatalf("signers = %s", machine.Files[signersPath])
	}

	if stored.Signers[0]["via"] != "migration" || stored.Signers[0]["since"] != "2026-09-11T10:00:00Z" {
		t.Fatalf("signer = %v", stored.Signers[0])
	}

	if machine.Modes[signersPath] != 0o600 {
		t.Fatalf("mode = %o", machine.Modes[signersPath])
	}

	trust, err := sshkeys.LoadTrust(machine, signersPath)
	if err != nil || len(trust.Keys()) != 2 {
		t.Fatalf("the store the migration writes is the one the agent reads: %+v, %v", trust, err)
	}

	before := string(machine.Files[signersPath])
	if _, err := runner(machine, migration).Run(); err != nil || string(machine.Files[signersPath]) != before {
		t.Fatalf("a second pass changed the store: %v", err)
	}
}

func TestKeySignersLeavesAnExistingStoreAlone(t *testing.T) {
	machine := newSys()
	configured(machine)
	withBlock(machine, laptopKey)
	machine.Files[signersPath] = []byte(`{"signers":[],"removed":[],"kept":true}` + "\n")

	if _, err := runner(machine, keySigners()).Run(); err != nil {
		t.Fatal(err)
	}

	if string(machine.Files[signersPath]) != `{"signers":[],"removed":[],"kept":true}`+"\n" {
		t.Fatalf("store = %s", machine.Files[signersPath])
	}
}

func TestKeySignersWritesNothingWithoutAKeyToSeed(t *testing.T) {
	cases := map[string]func(*modtest.FakeSys){
		"no authorized_keys": func(*modtest.FakeSys) {},
		"no managed block": func(machine *modtest.FakeSys) {
			machine.Files[sshkeys.DefaultPath] = []byte(outsideKey + "\n")
		},
		"an empty block":             func(machine *modtest.FakeSys) { withBlock(machine) },
		"only keys that cannot sign": func(machine *modtest.FakeSys) { withBlock(machine, rsaKey, optioned) },
		"a link out of .ssh": func(machine *modtest.FakeSys) {
			machine.Files["/root/.ssh/authorized_keys"] = []byte("# >>> pupitre keys >>>\n" + laptopKey + "\n# <<< pupitre keys <<<\n")
			machine.Links[sshkeys.DefaultPath] = "/root/.ssh/authorized_keys"
		},
	}

	for name, prepare := range cases {
		t.Run(name, func(t *testing.T) {
			machine := newSys()
			configured(machine)
			prepare(machine)

			result, err := runner(machine, keySigners()).Run()
			if err != nil || result.Failure != nil {
				t.Fatalf("result = %+v, err = %v", result, err)
			}

			if _, written := machine.Files[signersPath]; written {
				t.Fatalf("store written: %s", machine.Files[signersPath])
			}
		})
	}
}
