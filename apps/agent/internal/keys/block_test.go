package keys_test

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/keys"
	"pupitre.studio/agent/internal/modules/modtest"
)

const (
	laptop  = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILykUfO8a7qKBQHbW/KSfnaTtl1nAJxVpOzifJBri1Hl jordan@laptop"
	desktop = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGb1YbGvDgQBGNPCsjkPu1FdQBcyRZY0ubmZmvUKpH+E jordan@desktop"
	own     = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFYbYqYFCzS+wnaB9G7NkFuFRPlBRbxJqcVJ0m8OvXKp secours"
	path    = "/home/dev/.ssh/authorized_keys"
)

func parse(t *testing.T, lines ...string) []keys.Key {
	t.Helper()

	parsed, refused := keys.ParseAll(lines)
	if len(refused) > 0 {
		t.Fatalf("refused keys: %v", refused)
	}

	return parsed
}

func machine(t *testing.T, content string) (*modtest.FakeSys, *modtest.SysContext) {
	t.Helper()

	fake := modtest.NewFakeSys()
	if content != "" {
		fake.Files[path] = []byte(content)
	}

	return fake, modtest.NewSysContext(fake)
}

func TestFingerprintIsTheOpenSSHOne(t *testing.T) {
	key := parse(t, laptop)[0]

	if !strings.HasPrefix(key.Fingerprint(), "SHA256:") || len(key.Fingerprint()) != len("SHA256:")+43 {
		t.Fatalf("empreinte = %q", key.Fingerprint())
	}

	if key.Fingerprint() == parse(t, desktop)[0].Fingerprint() {
		t.Fatal("two different keys share the same fingerprint")
	}
}

func TestSyncWritesTheBlockAndLeavesTheRestAlone(t *testing.T) {
	fake, ctx := machine(t, own+"\n")

	changed, err := keys.Sync(ctx, keys.Target{Path: path, Owner: "dev"}, parse(t, laptop, desktop))
	if err != nil || !changed {
		t.Fatalf("Sync = %v, %v", changed, err)
	}

	content := string(fake.Files[path])
	if !strings.HasPrefix(content, own+"\n") {
		t.Fatalf("the client line moved:\n%s", content)
	}

	for _, line := range []string{laptop, desktop} {
		if !strings.Contains(content, line) {
			t.Errorf("missing key:\n%s", content)
		}
	}

	if fake.Modes[path] != keys.FileMode || fake.Owners[path] != "dev:dev" {
		t.Fatalf("mode %o, owner %q", fake.Modes[path], fake.Owners[path])
	}
}

func TestSyncRewritesNothingWhenTheKeysAreUnchanged(t *testing.T) {
	fake, ctx := machine(t, own+"\n")

	keys.Sync(ctx, keys.Target{Path: path, Owner: "dev"}, parse(t, laptop, desktop))
	before := len(fake.Mutations)

	changed, err := keys.Sync(ctx, keys.Target{Path: path, Owner: "dev"}, parse(t, desktop, laptop, desktop))
	if err != nil || changed || len(fake.Mutations) != before {
		t.Fatalf("changed = %v, err = %v, mutations %d → %d", changed, err, before, len(fake.Mutations))
	}
}

func TestSyncWithdrawsAKeyWithoutTouchingTheClientsOwn(t *testing.T) {
	fake, ctx := machine(t, own+"\n")

	keys.Sync(ctx, keys.Target{Path: path, Owner: "dev"}, parse(t, laptop, desktop))
	keys.Sync(ctx, keys.Target{Path: path, Owner: "dev"}, parse(t, laptop))

	content := string(fake.Files[path])
	if strings.Contains(content, desktop) {
		t.Fatalf("the removed key still opens:\n%s", content)
	}

	if !strings.Contains(content, laptop) || !strings.Contains(content, own) {
		t.Fatalf("one key too many disappeared:\n%s", content)
	}
}

func TestSyncEmptiesTheBlockWhenThePlatformSendsNothing(t *testing.T) {
	fake, ctx := machine(t, own+"\n")

	keys.Sync(ctx, keys.Target{Path: path, Owner: "dev"}, parse(t, laptop))
	keys.Sync(ctx, keys.Target{Path: path, Owner: "dev"}, nil)

	if listed := keys.Listed(ctx, path); len(listed) != 0 {
		t.Fatalf("bloc = %v", listed)
	}

	if !strings.Contains(string(fake.Files[path]), own) {
		t.Fatalf("the client key was carried away:\n%s", fake.Files[path])
	}
}

func TestListedReadsTheBlockAndNothingAroundIt(t *testing.T) {
	_, ctx := machine(t, own+"\n")

	keys.Sync(ctx, keys.Target{Path: path, Owner: "dev"}, parse(t, laptop, desktop))

	listed := keys.Listed(ctx, path)
	if len(listed) != 2 {
		t.Fatalf("bloc = %v", listed)
	}

	for _, key := range listed {
		if key.Line() == own {
			t.Fatal("the client key is counted in the block")
		}
	}
}

func TestListedAnswersNothingWithoutABlock(t *testing.T) {
	_, ctx := machine(t, own+"\n")

	if listed := keys.Listed(ctx, path); listed != nil {
		t.Fatalf("bloc = %v", listed)
	}
}

func TestSyncRefusesALinkPlantedInPlaceOfTheFile(t *testing.T) {
	fake, ctx := machine(t, "")
	fake.Files["/etc/shadow"] = []byte("root:$6$hash\n")
	fake.Files[path] = []byte("root:$6$hash\n")
	fake.Links[path] = "/etc/shadow"
	before := len(fake.Mutations)

	changed, err := keys.Sync(ctx, keys.Target{Path: path, Owner: "dev"}, parse(t, laptop))
	if err == nil || changed || len(fake.Mutations) != before {
		t.Fatalf("Sync = %v, %v, mutations %d → %d", changed, err, before, len(fake.Mutations))
	}

	if listed := keys.Listed(ctx, path); listed != nil {
		t.Fatalf("the link was read: %v", listed)
	}
}

func TestSyncCreatesTheFileWhenThereIsNone(t *testing.T) {
	fake, ctx := machine(t, "")

	changed, err := keys.Sync(ctx, keys.Target{Path: path, Owner: "dev"}, parse(t, laptop))
	if err != nil || !changed {
		t.Fatalf("Sync = %v, %v", changed, err)
	}

	if !strings.Contains(string(fake.Files[path]), laptop) || fake.Owners[path] != "dev:dev" {
		t.Fatalf("content = %q, owner = %q", fake.Files[path], fake.Owners[path])
	}
}

func TestParseAllSetsAsideWhatItCannotRead(t *testing.T) {
	parsed, refused := keys.ParseAll([]string{laptop, "", "ssh-ed25519 broken", "  "})

	if len(parsed) != 1 || len(refused) != 1 || refused[0] != "ssh-ed25519 broken" {
		t.Fatalf("parsed = %v, refused = %v", parsed, refused)
	}
}
