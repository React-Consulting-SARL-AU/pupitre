package state_test

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/shots"
	"pupitre.studio/agent/internal/state"
)

func gallery(fake *modtest.FakeSys, path string, size int, age time.Duration) {
	fake.Files[path] = make([]byte, size)
	fake.Times[path] = modtest.Epoch.Add(-age)
}

func shotFixture(t *testing.T) (*modtest.FakeSys, *state.Reader) {
	t.Helper()

	fake, reader := agentFixture(t)
	gallery(fake, "/home/dev/shots/web/2026-09-04/login.png", 24_000, time.Hour)
	gallery(fake, "/home/dev/shots/_unfiled/2026-08-30/dashboard.png", 48_000, 5*24*time.Hour)
	gallery(fake, "/home/dev/shots/web/2026-07-01/old.png", 12_000, 60*24*time.Hour)

	return fake, reader
}

func TestShotsAreListedNewestFirstWithTheirGalleryPath(t *testing.T) {
	_, reader := shotFixture(t)

	shots := reader.Shots()
	if len(shots) != 3 {
		t.Fatalf("got %d shots: %+v", len(shots), shots)
	}

	if shots[0].Name != "login.png" || shots[0].Path != "web/2026-09-04/login.png" {
		t.Fatalf("unexpected first shot %+v", shots[0])
	}

	if shots[0].SizeBytes != 24_000 || shots[0].CreatedAt != "2026-09-04T11:00:00Z" {
		t.Fatalf("unexpected reading %+v", shots[0])
	}

	if shots[2].Name != "old.png" {
		t.Fatalf("the oldest must come last: %+v", shots)
	}

	if shots[0].Project == nil || *shots[0].Project != "web" {
		t.Fatalf("a capture under a project folder belongs to that project: %+v", shots[0])
	}

	if shots[1].Project != nil {
		t.Fatalf("a capture under %s belongs to no project: %+v", "_unfiled", shots[1])
	}
}

func TestShotsLeaveASymlinkOutOfTheGallery(t *testing.T) {
	fake, reader := shotFixture(t)
	fake.Files["/home/dev/shots/web/2026-09-04/shadow.png"] = []byte("root:x\n")
	fake.Links["/home/dev/shots/web/2026-09-04/shadow.png"] = "/etc/shadow"

	for _, listed := range reader.Shots() {
		if listed.Name == "shadow.png" {
			t.Fatalf("the link is listed: %+v", listed)
		}
	}

	if _, err := reader.ReadShot("web/2026-09-04/shadow.png"); err == nil {
		t.Fatal("the link was read")
	}
}

func TestShotsURLIsPublicOnlyOnceAProviderServesTheGallery(t *testing.T) {
	fake, reader := shotFixture(t)
	fake.Files["/etc/pupitre/env"] = []byte(state.DomainKey + "=flyleaf.dev\n")

	if got, exposed := reader.ShotsURL(); got != "http://127.0.0.1:8099" || exposed {
		t.Fatalf("without an exposure the gallery is local: %q %v", got, exposed)
	}

	fake.Files[shots.ExposurePath] = shots.Exposure{Hostname: "shots.flyleaf.dev", Token: "abc123"}.Content()
	if _, exposed := reader.ShotsURL(); exposed {
		t.Fatal("no provider serves the route yet, the address would not answer")
	}

	fake.Files["/etc/pupitre/exposure"] = []byte("cloudflare\n")
	if got, exposed := reader.ShotsURL(); got != "https://shots.flyleaf.dev/abc123" || !exposed {
		t.Fatalf("got %q %v", got, exposed)
	}

	fake.Files["/etc/pupitre/env"] = []byte(state.DomainKey + "=elsewhere.dev\n")
	if _, exposed := reader.ShotsURL(); exposed {
		t.Fatal("a name outside the served domain is not routed")
	}
}

func TestShotsCleanRemovesOnlyWhatIsPastTheKeepWindow(t *testing.T) {
	fake, reader := shotFixture(t)

	if removed := reader.CleanShots(); removed != 1 {
		t.Fatalf("got %d removed, want the sixty-day-old capture alone", removed)
	}

	if _, kept := fake.Files["/home/dev/shots/_unfiled/2026-08-30/dashboard.png"]; !kept {
		t.Fatal("a five-day-old capture must be kept")
	}

	if _, gone := fake.Files["/home/dev/shots/web/2026-07-01/old.png"]; gone {
		t.Fatal("the old capture must be gone")
	}
}

func payload(size int) []byte {
	content := make([]byte, size)
	for i := range content {
		content[i] = byte(i*7 + i/251)
	}

	return content
}

func TestShotsReadRendersTheExactBytesOfTheFile(t *testing.T) {
	fake, reader := shotFixture(t)

	content := payload(24_000)
	fake.Files["/home/dev/shots/web/2026-09-04/login.png"] = content

	shot, err := reader.ReadShot("web/2026-09-04/login.png")
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	if !bytes.Equal(shot.Bytes, content) {
		t.Fatal("the bytes rendered are not those of the file")
	}

	digest := sha256.Sum256(content)
	if shot.Digest != hex.EncodeToString(digest[:]) || shot.SizeBytes != int64(len(content)) {
		t.Fatalf("unexpected accounting %d %s", shot.SizeBytes, shot.Digest)
	}

	if shot.MediaType != "image/png" || shot.Path != "web/2026-09-04/login.png" {
		t.Fatalf("unexpected identity %+v", shot)
	}

	if !bytes.Equal(join(t, state.ChunkShot(shot.Bytes)), content) {
		t.Fatal("the chunks do not reassemble into the file")
	}
}

func TestShotsReadOpensOnlyWhatTheGalleryLists(t *testing.T) {
	fake, reader := shotFixture(t)
	fake.Files["/etc/pupitre/env"] = []byte("PUPITRE_DOMAIN=flyleaf.dev\n")
	fake.Files["/home/dev/shots/web/2026-09-04/notes.txt"] = []byte("rien à voir\n")

	for _, refused := range []string{
		"../../etc/pupitre/env",
		"/etc/pupitre/env",
		"/home/dev/shots/web/2026-09-04/login.png",
		"web/2026-09-04/./login.png",
		"web/2026-09-04/absente.png",
		"web/2026-09-04/notes.txt",
		"",
	} {
		if _, err := reader.ReadShot(refused); err == nil {
			t.Fatalf("%q must be refused", refused)
		}
	}
}

func TestShotsReadCutsALargeCaptureIntoBoundedLines(t *testing.T) {
	fake, reader := shotFixture(t)

	content := payload(5 << 20)
	fake.Files["/home/dev/shots/web/2026-09-04/login.png"] = content

	shot, err := reader.ReadShot("web/2026-09-04/login.png")
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	chunks := state.ChunkShot(shot.Bytes)
	if len(chunks) != (len(content)+state.ShotChunkBytes-1)/state.ShotChunkBytes {
		t.Fatalf("got %d chunks for %d bytes", len(chunks), len(content))
	}

	for seq, encoded := range chunks {
		if len(encoded) > 4*state.ShotChunkBytes/3+4 {
			t.Fatalf("chunk %d is %d characters long", seq, len(encoded))
		}
	}

	if !bytes.Equal(join(t, chunks), content) {
		t.Fatal("a large capture does not reassemble")
	}
}

func TestShotsReadRefusesACaptureBeyondTheCap(t *testing.T) {
	fake, reader := shotFixture(t)
	gallery(fake, "/home/dev/shots/web/2026-09-04/enorme.png", state.ShotMaxBytes+1, time.Hour)

	if _, err := reader.ReadShot("web/2026-09-04/enorme.png"); err == nil {
		t.Fatal("a capture beyond the cap must be refused")
	}
}

func join(t *testing.T, chunks []string) []byte {
	t.Helper()

	var content []byte

	for _, encoded := range chunks {
		decoded, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			t.Fatalf("chunk is not base64: %v", err)
		}

		content = append(content, decoded...)
	}

	return content
}

func TestALargeCaptureLeavesTheChannelUsable(t *testing.T) {
	fake, reader := shotFixture(t)

	content := payload(5 << 20)
	fake.Files["/home/dev/shots/web/2026-09-04/login.png"] = content

	server := protocol.NewServer(protocol.Options{AgentVersion: "0.0.0-test", Now: modtest.NewClock(time.Millisecond).Now})
	state.RegisterCommands(server, reader)

	input := strings.Join([]string{
		`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":3}}`,
		`{"id":2,"cmd":"shots.read","params":{"path":"web/2026-09-04/login.png"}}`,
		`{"id":3,"cmd":"ping"}`,
	}, "\n") + "\n"

	var out bytes.Buffer
	if err := server.Serve(strings.NewReader(input), &out); err != nil {
		t.Fatalf("serve: %v", err)
	}

	lines := strings.Split(strings.TrimRight(out.String(), "\n"), "\n")

	var received []string
	var answer struct {
		OK     bool `json:"ok"`
		Result struct {
			SizeBytes int64  `json:"size_bytes"`
			SHA256    string `json:"sha256"`
			Chunks    int    `json:"chunks"`
		} `json:"result"`
	}

	for _, line := range lines {
		if len(line) > 96*1024 {
			t.Fatalf("a line of %d bytes went out on the channel", len(line))
		}

		var envelope struct {
			ID    int64  `json:"id"`
			Event string `json:"event"`
			Seq   int    `json:"seq"`
			Bytes string `json:"bytes"`
		}
		if err := json.Unmarshal([]byte(line), &envelope); err != nil {
			t.Fatalf("line is not JSON: %v", err)
		}

		if envelope.Event != "shot" {
			continue
		}

		if envelope.ID != 2 || envelope.Seq != len(received) {
			t.Fatalf("unexpected shot event %d/%d", envelope.ID, envelope.Seq)
		}

		received = append(received, envelope.Bytes)
	}

	if err := json.Unmarshal([]byte(lines[len(lines)-2]), &answer); err != nil || !answer.OK {
		t.Fatalf("the acknowledgement is missing: %v", err)
	}

	if answer.Result.Chunks != len(received) || answer.Result.SizeBytes != int64(len(content)) {
		t.Fatalf("the acknowledgement does not describe the stream: %+v", answer.Result)
	}

	digest := sha256.Sum256(join(t, received))
	if hex.EncodeToString(digest[:]) != answer.Result.SHA256 {
		t.Fatal("what came out of the channel is not what the acknowledgement announced")
	}

	if !bytes.Equal(join(t, received), content) {
		t.Fatal("the capture did not survive the channel")
	}

	if !strings.Contains(lines[len(lines)-1], `"id":3`) {
		t.Fatalf("the channel did not answer what followed: %s", lines[len(lines)-1])
	}
}
