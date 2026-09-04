package state_test

import (
	"testing"
	"time"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/state"
)

func gallery(fake *modtest.FakeSys, path string, size int, age time.Duration) {
	fake.Files[path] = make([]byte, size)
	fake.Times[path] = modtest.Epoch.Add(-age)
}

func shotFixture(t *testing.T) (*modtest.FakeSys, *state.Reader) {
	t.Helper()

	fake, reader := agentFixture(t)
	gallery(fake, "/home/dev/shots/2026-09-04/login.png", 24_000, time.Hour)
	gallery(fake, "/home/dev/shots/2026-08-30/dashboard.png", 48_000, 5*24*time.Hour)
	gallery(fake, "/home/dev/shots/2026-07-01/old.png", 12_000, 60*24*time.Hour)

	return fake, reader
}

func TestShotsAreListedNewestFirstWithTheirGalleryPath(t *testing.T) {
	_, reader := shotFixture(t)

	shots := reader.Shots()
	if len(shots) != 3 {
		t.Fatalf("got %d shots: %+v", len(shots), shots)
	}

	if shots[0].Name != "login.png" || shots[0].Path != "2026-09-04/login.png" {
		t.Fatalf("unexpected first shot %+v", shots[0])
	}

	if shots[0].SizeBytes != 24_000 || shots[0].CreatedAt != "2026-09-04T11:00:00Z" {
		t.Fatalf("unexpected reading %+v", shots[0])
	}

	if shots[2].Name != "old.png" {
		t.Fatalf("the oldest must come last: %+v", shots)
	}
}

func TestShotsURLComesFromTheGalleryRow(t *testing.T) {
	fake, reader := shotFixture(t)

	if got := reader.ShotsURL(); got != "http://127.0.0.1:8099" {
		t.Fatalf("got %q", got)
	}

	fake.Files["/etc/pupitre/env"] = []byte(state.DomainKey + "=flymate.dev\n")
	if got := reader.ShotsURL(); got != "https://shots.flymate.dev" {
		t.Fatalf("got %q", got)
	}
}

func TestShotsCleanRemovesOnlyWhatIsPastTheKeepWindow(t *testing.T) {
	fake, reader := shotFixture(t)

	if removed := reader.CleanShots(); removed != 1 {
		t.Fatalf("got %d removed, want the sixty-day-old capture alone", removed)
	}

	if _, kept := fake.Files["/home/dev/shots/2026-08-30/dashboard.png"]; !kept {
		t.Fatal("a five-day-old capture must be kept")
	}

	if _, gone := fake.Files["/home/dev/shots/2026-07-01/old.png"]; gone {
		t.Fatal("the old capture must be gone")
	}
}
