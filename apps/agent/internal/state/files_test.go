package state_test

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"strconv"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/state"
)

func filesFixture(t *testing.T) (*modtest.FakeSys, *state.Reader) {
	t.Helper()

	fake, reader := agentFixture(t)
	fake.Dirs["/home/dev"] = true
	fake.Dirs["/home/dev/notes"] = true
	fake.Files["/home/dev/notes/readme.md"] = []byte("# flyleaf\n")
	fake.Files["/home/dev/notes/logo.png"] = []byte("\x89PNG\r\n")
	fake.Modes["/home/dev/notes/readme.md"] = 0o644
	fake.Modes["/home/dev/notes"] = 0o755

	return fake, reader
}

func digest(content []byte) string {
	sum := sha256.Sum256(content)

	return hex.EncodeToString(sum[:])
}

func TestListingDescribesEveryEntryOfOneFolder(t *testing.T) {
	_, reader := filesFixture(t)

	listed, err := reader.ListFiles("notes")
	if err != nil {
		t.Fatalf("ListFiles: %v", err)
	}

	if listed.Path != "notes" || listed.Truncated || len(listed.Entries) != 2 {
		t.Fatalf("unexpected listing %+v", listed)
	}

	first := listed.Entries[0]
	if first.Name != "logo.png" || first.Kind != "file" || first.Mode != "0644" {
		t.Fatalf("unexpected entry %+v", first)
	}

	if listed.Entries[1].Name != "readme.md" || listed.Entries[1].SizeBytes != 10 {
		t.Fatalf("unexpected entry %+v", listed.Entries[1])
	}

	if listed.Entries[1].ModifiedAt != "2026-09-04T12:00:00Z" {
		t.Fatalf("unexpected date %q", listed.Entries[1].ModifiedAt)
	}
}

func TestListingTheRootIsTheEmptyPath(t *testing.T) {
	_, reader := filesFixture(t)

	listed, err := reader.ListFiles("")
	if err != nil {
		t.Fatalf("ListFiles: %v", err)
	}

	if listed.Path != "" {
		t.Fatalf("the root is named by the empty path, got %q", listed.Path)
	}

	for _, entry := range listed.Entries {
		if entry.Name == "notes" && entry.Kind == "dir" {
			return
		}
	}

	t.Fatalf("the root does not hold notes: %+v", listed.Entries)
}

func TestListingStopsAtTheCapAndSaysSo(t *testing.T) {
	fake, reader := filesFixture(t)
	for index := range state.FileListLimit + 10 {
		fake.Files["/home/dev/many/file-"+strconv.Itoa(index)] = []byte("x")
	}

	listed, err := reader.ListFiles("many")
	if err != nil {
		t.Fatalf("ListFiles: %v", err)
	}

	if len(listed.Entries) != state.FileListLimit || !listed.Truncated {
		t.Fatalf("got %d entries, truncated %v", len(listed.Entries), listed.Truncated)
	}
}

func TestListingAFolderThatIsNotThereIsRefused(t *testing.T) {
	_, reader := filesFixture(t)

	if _, err := reader.ListFiles("nowhere"); err == nil {
		t.Fatal("a missing folder must be refused, not answered with an empty list")
	}

	if _, err := reader.ListFiles("notes/readme.md"); err == nil {
		t.Fatal("a file is not a folder to list")
	}
}

func TestEveryPathOutOfTheWorkFolderIsRefused(t *testing.T) {
	fake, reader := filesFixture(t)
	fake.Files["/etc/shadow"] = []byte("root:x\n")
	fake.Links["/home/dev/notes/shadow"] = "/etc/shadow"

	for _, wanted := range []string{"/etc/shadow", "../../etc/shadow", "notes/../../etc/shadow", "notes/shadow"} {
		if _, err := reader.ReadFile(wanted); err == nil {
			t.Fatalf("%q was read", wanted)
		}
	}
}

func TestAReadComesBackInChunksThatGlueBackTogether(t *testing.T) {
	fake, reader := filesFixture(t)
	body := strings.Repeat("ligne de journal\n", 8000)
	fake.Files["/home/dev/notes/journal.txt"] = []byte(body)

	content, err := reader.ReadFile("notes/journal.txt")
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}

	if content.MediaType != state.MediaTypeText || content.Digest != digest([]byte(body)) {
		t.Fatalf("unexpected read %+v", content)
	}

	chunks := state.ChunkFile(content.Bytes)
	if len(chunks) < 2 {
		t.Fatalf("a body of %d bytes must be cut, got %d chunk", len(body), len(chunks))
	}

	var glued []byte
	for _, chunk := range chunks {
		decoded, err := base64.StdEncoding.DecodeString(chunk)
		if err != nil {
			t.Fatalf("chunk does not decode alone: %v", err)
		}

		glued = append(glued, decoded...)
	}

	if string(glued) != body || digest(glued) != content.Digest {
		t.Fatal("the chunks do not glue back into the file")
	}
}

func TestAReadNamesTheTypeByExtensionThenByContent(t *testing.T) {
	fake, reader := filesFixture(t)
	fake.Files["/home/dev/notes/LICENSE"] = []byte("MIT\n")

	image, err := reader.ReadFile("notes/logo.png")
	if err != nil || image.MediaType != "image/png" {
		t.Fatalf("ReadFile = %+v, %v", image, err)
	}

	text, err := reader.ReadFile("notes/LICENSE")
	if err != nil || text.MediaType != state.MediaTypeText {
		t.Fatalf("a file with no extension that is valid UTF-8 is text: %+v, %v", text, err)
	}
}

func TestAFileBeyondTheCapIsRefusedBeforeItIsRead(t *testing.T) {
	fake, reader := filesFixture(t)
	fake.Files["/home/dev/notes/dump.sql"] = make([]byte, state.FileTextMaxBytes+1)
	fake.Files["/home/dev/notes/huge.png"] = make([]byte, state.FileImageMaxBytes+1)

	if _, err := reader.ReadFile("notes/dump.sql"); err == nil {
		t.Fatal("a text beyond its cap was read")
	}

	if _, err := reader.ReadFile("notes/huge.png"); err == nil {
		t.Fatal("an image beyond its cap was read")
	}
}

func TestAKindTheChannelDoesNotCarryIsRefused(t *testing.T) {
	fake, reader := filesFixture(t)
	fake.Files["/home/dev/notes/contrat.pdf"] = []byte("%PDF-1.7\n\x00\x01binaire")

	_, err := reader.ReadFile("notes/contrat.pdf")
	if err == nil {
		t.Fatal("a pdf was read")
	}

	if !strings.Contains(err.Error(), "pdf") {
		t.Fatalf("the refusal must name the file: %v", err)
	}
}

func TestAWriteReplacesTheFileAndKeepsItsMode(t *testing.T) {
	fake, reader := filesFixture(t)
	before := fake.Files["/home/dev/notes/readme.md"]

	written, err := reader.WriteFile("notes/readme.md",
		base64.StdEncoding.EncodeToString([]byte("# flyleaf\n\nDeux lignes.\n")), digest(before))
	if err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	stored := fake.Files["/home/dev/notes/readme.md"]
	if string(stored) != "# flyleaf\n\nDeux lignes.\n" {
		t.Fatalf("the file holds %q", stored)
	}

	if written.SizeBytes != int64(len(stored)) || written.SHA256 != digest(stored) {
		t.Fatalf("unexpected answer %+v", written)
	}

	if fake.Modes["/home/dev/notes/readme.md"] != 0o644 {
		t.Fatalf("the mode changed: %v", fake.Modes["/home/dev/notes/readme.md"])
	}
}

func TestANewFileBelongsToTheProjectsUser(t *testing.T) {
	fake, reader := filesFixture(t)

	if _, err := reader.WriteFile("notes/todo.md", base64.StdEncoding.EncodeToString([]byte("- rien\n")), ""); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	if owner := fake.Owners["/home/dev/notes/todo.md"]; owner != "dev:dev" {
		t.Fatalf("a file created by the reader belongs to %q", owner)
	}
}

func TestAWriteOnAFileThatMovedOnIsRefused(t *testing.T) {
	fake, reader := filesFixture(t)
	stale := digest([]byte("# flyleaf\n"))
	fake.Files["/home/dev/notes/readme.md"] = []byte("# flyleaf\n\nun agent est passé\n")

	_, err := reader.WriteFile("notes/readme.md", base64.StdEncoding.EncodeToString([]byte("écrasé\n")), stale)
	if err == nil {
		t.Fatal("the write overwrote what an agent had just written")
	}

	if string(fake.Files["/home/dev/notes/readme.md"]) != "# flyleaf\n\nun agent est passé\n" {
		t.Fatal("the file was touched by a refused write")
	}
}

func TestAWriteWithoutADigestNeverOverwrites(t *testing.T) {
	fake, reader := filesFixture(t)

	if _, err := reader.WriteFile("notes/readme.md", base64.StdEncoding.EncodeToString([]byte("écrasé\n")), ""); err == nil {
		t.Fatal("an existing file was overwritten without a digest")
	}

	if string(fake.Files["/home/dev/notes/readme.md"]) != "# flyleaf\n" {
		t.Fatal("the file was touched by a refused write")
	}
}

func TestAWriteBeyondTheCapIsRefused(t *testing.T) {
	_, reader := filesFixture(t)

	heavy := base64.StdEncoding.EncodeToString(make([]byte, state.FileWriteMaxBytes+1))
	if _, err := reader.WriteFile("notes/heavy.bin", heavy, ""); err == nil {
		t.Fatal("a write beyond the cap went through")
	}
}

func TestAFolderIsCreatedOnceAndTheSecondTimeChangesNothing(t *testing.T) {
	fake, reader := filesFixture(t)

	made, err := reader.MakeFolder("notes/drafts")
	if err != nil || made.Path != "notes/drafts" {
		t.Fatalf("MakeFolder = %+v, %v", made, err)
	}

	if !fake.Dirs["/home/dev/notes/drafts"] {
		t.Fatal("the folder was not created")
	}

	if owner := fake.Owners["/home/dev/notes/drafts"]; owner != "dev:dev" {
		t.Fatalf("a folder created by the reader belongs to %q", owner)
	}

	if _, err := reader.MakeFolder("notes/drafts"); err != nil {
		t.Fatalf("a folder already there is not an error: %v", err)
	}

	if _, err := reader.MakeFolder("notes/readme.md"); err == nil {
		t.Fatal("a file already carries that name")
	}
}

func TestARenameNeverOverwritesWhatIsAlreadyThere(t *testing.T) {
	fake, reader := filesFixture(t)

	moved, err := reader.MoveFile("notes/readme.md", "notes/README.md")
	if err != nil || moved.Path != "notes/README.md" {
		t.Fatalf("MoveFile = %+v, %v", moved, err)
	}

	if _, still := fake.Files["/home/dev/notes/readme.md"]; still {
		t.Fatal("the entry stayed where it was")
	}

	if string(fake.Files["/home/dev/notes/README.md"]) != "# flyleaf\n" {
		t.Fatal("the content did not travel")
	}

	if _, err := reader.MoveFile("notes/README.md", "notes/logo.png"); err == nil {
		t.Fatal("the move overwrote an existing entry")
	}

	if _, err := reader.MoveFile("notes/README.md", "../escape.md"); err == nil {
		t.Fatal("the move left the work folder")
	}
}

func TestAFolderThatHoldsSomethingIsNotDeletedByAccident(t *testing.T) {
	fake, reader := filesFixture(t)
	fake.Files["/home/dev/notes/drafts/one.md"] = []byte("un\n")

	_, err := reader.RemoveFile("notes", false)
	if err == nil {
		t.Fatal("a folder that is not empty was deleted")
	}

	if !strings.Contains(err.Error(), "4") {
		t.Fatalf("the refusal must say how many entries it holds: %v", err)
	}

	removed, err := reader.RemoveFile("notes", true)
	if err != nil {
		t.Fatalf("RemoveFile: %v", err)
	}

	if removed.Removed != 5 {
		t.Fatalf("removed = %d, want the folder and the four entries under it", removed.Removed)
	}

	if _, still := fake.Files["/home/dev/notes/readme.md"]; still {
		t.Fatal("the folder was not emptied")
	}
}

func TestOneFileIsDeletedOnItsOwn(t *testing.T) {
	fake, reader := filesFixture(t)

	removed, err := reader.RemoveFile("notes/readme.md", false)
	if err != nil || removed.Removed != 1 {
		t.Fatalf("RemoveFile = %+v, %v", removed, err)
	}

	if _, still := fake.Files["/home/dev/notes/readme.md"]; still {
		t.Fatal("the file is still there")
	}

	if _, err := reader.RemoveFile("notes/readme.md", false); err == nil {
		t.Fatal("deleting what is not there must be refused")
	}
}

func TestAStatCarriesTheDigestOnlyWhenItIsAsked(t *testing.T) {
	_, reader := filesFixture(t)

	plain, err := reader.StatFile("notes/readme.md", false)
	if err != nil {
		t.Fatalf("StatFile: %v", err)
	}

	if plain.SHA256 != "" || plain.MediaType != state.MediaTypeText || plain.Mode != "0644" {
		t.Fatalf("unexpected stat %+v", plain)
	}

	hashed, err := reader.StatFile("notes/readme.md", true)
	if err != nil {
		t.Fatalf("StatFile: %v", err)
	}

	if hashed.SHA256 != digest([]byte("# flyleaf\n")) {
		t.Fatalf("unexpected digest %+v", hashed)
	}

	folder, err := reader.StatFile("notes", true)
	if err != nil || folder.Kind != "dir" || folder.MediaType != "" {
		t.Fatalf("a folder has no content to hash: %+v, %v", folder, err)
	}
}
