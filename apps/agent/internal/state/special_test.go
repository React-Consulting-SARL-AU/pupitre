package state_test

import (
	"io/fs"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
)

func TestAPipeInTheWorkFolderIsRefusedNotRead(t *testing.T) {
	fake, reader := filesFixture(t)
	fake.Files["/home/dev/notes/fifo"] = nil
	fake.Modes["/home/dev/notes/fifo"] = fs.ModeNamedPipe | 0o644

	_, err := reader.ReadFile("notes/fifo")
	if err == nil || !strings.Contains(err.Error(), "notes/fifo") {
		t.Fatalf("got %v, want a refusal naming the path", err)
	}

	if _, err := reader.StatFile("notes/fifo", true); err == nil {
		t.Fatal("a digest asked of a pipe must be refused, never read")
	}
}

func TestAPipeIsListedAndStatedAsSpecial(t *testing.T) {
	fake, reader := filesFixture(t)
	fake.Files["/home/dev/notes/fifo"] = nil
	fake.Modes["/home/dev/notes/fifo"] = fs.ModeNamedPipe | 0o644

	stat, err := reader.StatFile("notes/fifo", false)
	if err != nil || stat.Kind != contract.FileKindSpecial {
		t.Fatalf("stat = %+v, %v", stat, err)
	}
	if err := contract.ValidateValue("FsStatResult", stat); err != nil {
		t.Fatal(err)
	}

	listing, err := reader.ListFiles("notes")
	if err != nil {
		t.Fatal(err)
	}
	if err := contract.ValidateValue("FsListResult", listing); err != nil {
		t.Fatal(err)
	}

	for _, entry := range listing.Entries {
		if entry.Name == "fifo" && entry.Kind != contract.FileKindSpecial {
			t.Fatalf("fifo listed as %q", entry.Kind)
		}
	}
}
