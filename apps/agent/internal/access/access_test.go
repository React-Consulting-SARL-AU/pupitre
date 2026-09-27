package access

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/gate"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
)

func storeOn(t *testing.T, fake *modtest.FakeSys) *Store {
	t.Helper()

	return New(Options{
		Ctx:  modtest.NewSysContext(fake),
		Lock: filepath.Join(t.TempDir(), "access.lock"),
		Now:  func() time.Time { return time.Date(2026, 9, 27, 10, 0, 0, 0, time.UTC) },
	})
}

func stored(t *testing.T, fake *modtest.FakeSys) gate.Access {
	t.Helper()

	var access gate.Access
	if err := json.Unmarshal(fake.Files[gate.AccessPath], &access); err != nil {
		t.Fatalf("access.json: %v", err)
	}

	return access
}

func TestAKeyIsStoredAsItsHashBesideADrawnSecret(t *testing.T) {
	fake := modtest.NewFakeSys()
	store := storeOn(t, fake)

	created, err := store.Create("abcdef012345", "Ce Mac", strings.Repeat("a", 64), nil)
	if err != nil {
		t.Fatal(err)
	}

	if created.CreatedAt != "2026-09-27T10:00:00Z" || created.Projects != nil {
		t.Fatalf("created %+v", created)
	}

	access := stored(t, fake)
	if len(access.Secret) != 64 || len(access.Keys) != 1 || access.Keys[0].Hash != strings.Repeat("a", 64) {
		t.Fatalf("stored %+v", access)
	}

	if !strings.Contains(string(fake.Files[gate.AccessPath]), `"projects": null`) {
		t.Fatal("a server-wide key must be written as null, which the gate reads as every project")
	}
}

func TestTheSecretSurvivesEveryChange(t *testing.T) {
	fake := modtest.NewFakeSys()
	store := storeOn(t, fake)

	if _, err := store.Create("abcdef012345", "One", strings.Repeat("a", 64), nil); err != nil {
		t.Fatal(err)
	}

	secret := stored(t, fake).Secret

	if err := store.Revoke("abcdef012345"); err != nil {
		t.Fatal(err)
	}

	if stored(t, fake).Secret != secret {
		t.Fatal("a new secret would sign every browser out")
	}
}

func TestATakenIDIsRefused(t *testing.T) {
	fake := modtest.NewFakeSys()
	store := storeOn(t, fake)

	if _, err := store.Create("abcdef012345", "One", strings.Repeat("a", 64), nil); err != nil {
		t.Fatal(err)
	}

	_, err := store.Create("abcdef012345", "Two", strings.Repeat("b", 64), nil)

	var refusal *protocol.Error
	if !errors.As(err, &refusal) || refusal.Code != "bad_request" {
		t.Fatalf("err = %v, want bad_request", err)
	}
}

func TestAnUpdateChangesOnlyWhatItNames(t *testing.T) {
	fake := modtest.NewFakeSys()
	store := storeOn(t, fake)

	if _, err := store.Create("abcdef012345", "One", strings.Repeat("a", 64), []string{"shop"}); err != nil {
		t.Fatal(err)
	}

	renamed := "Renamed"
	updated, err := store.Update("abcdef012345", &renamed, nil)
	if err != nil || updated.Name != "Renamed" || len(updated.Projects) != 1 {
		t.Fatalf("updated %+v, %v", updated, err)
	}

	var everything []string
	widened, err := store.Update("abcdef012345", nil, &everything)
	if err != nil || widened.Projects != nil || widened.Name != "Renamed" {
		t.Fatalf("widened %+v, %v", widened, err)
	}

	if _, err := store.Update("zzzzzzzzzzzz", &renamed, nil); err == nil {
		t.Fatal("an unknown key must be refused")
	}
}

func TestRevokingTwiceIsNotAFailure(t *testing.T) {
	fake := modtest.NewFakeSys()
	store := storeOn(t, fake)

	if err := store.Revoke("abcdef012345"); err != nil {
		t.Fatal(err)
	}
}

func TestAnUnreadableFileIsNeverOverwritten(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[gate.AccessPath] = []byte("{not json")
	store := storeOn(t, fake)

	if _, err := store.Create("abcdef012345", "One", strings.Repeat("a", 64), nil); err == nil {
		t.Fatal("a write over an unreadable file would drop every key it held")
	}

	if string(fake.Files[gate.AccessPath]) != "{not json" {
		t.Fatal("the file must be left as it was")
	}
}

func TestTheListNeverCarriesAHash(t *testing.T) {
	fake := modtest.NewFakeSys()
	store := storeOn(t, fake)

	if _, err := store.Create("abcdef012345", "One", strings.Repeat("a", 64), nil); err != nil {
		t.Fatal(err)
	}

	keys, err := store.List()
	if err != nil {
		t.Fatal(err)
	}

	encoded, _ := json.Marshal(keys)
	if strings.Contains(string(encoded), strings.Repeat("a", 64)) {
		t.Fatalf("the list must not carry the hash: %s", encoded)
	}
}

func TestEnsureDrawsTheSecretOnce(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := modtest.NewSysContext(fake)

	changed, err := Ensure(ctx)
	if err != nil || !changed {
		t.Fatalf("first: %v %v", changed, err)
	}

	secret := stored(t, fake).Secret

	changed, err = Ensure(ctx)
	if err != nil || changed || stored(t, fake).Secret != secret {
		t.Fatalf("second: %v %v", changed, err)
	}
}
