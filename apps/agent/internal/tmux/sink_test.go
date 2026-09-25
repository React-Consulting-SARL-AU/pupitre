package tmux

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func gnuSplit(t *testing.T) {
	t.Helper()

	out, err := exec.Command("split", "--version").Output()
	if err != nil || !strings.Contains(string(out), "GNU") {
		t.Skip("the sink needs GNU split, the one Ubuntu ships")
	}
}

func TestAJournalIsRotatedPastItsSizeWithoutLosingAByte(t *testing.T) {
	gnuSplit(t)

	journal := filepath.Join(t.TempDir(), "web's", "web.log")
	if err := os.MkdirAll(filepath.Dir(journal), 0o755); err != nil {
		t.Fatal(err)
	}

	marker := []byte("\n=== pupitre up ===\n")
	if err := os.WriteFile(journal, marker, 0o644); err != nil {
		t.Fatal(err)
	}

	var output bytes.Buffer
	for output.Len() < 3*journalBytes+journalBytes/2 {
		output.WriteString("GET /api/health 200 in 3ms, and some more words to fill the line\n")
	}

	piped := exec.Command("/bin/sh", "-c", sink(journal))
	piped.Stdin = bytes.NewReader(output.Bytes())
	if out, err := piped.CombinedOutput(); err != nil {
		t.Fatalf("%v: %s", err, out)
	}

	current, err := os.ReadFile(journal)
	if err != nil {
		t.Fatal(err)
	}

	older, err := os.ReadFile(journal + rotatedSuffix)
	if err != nil {
		t.Fatal(err)
	}

	if len(current) > journalBytes || len(older) > journalBytes {
		t.Fatalf("journal %d bytes, older copy %d: both stay under %d", len(current), len(older), journalBytes)
	}

	if !bytes.HasSuffix(output.Bytes(), append(older, current...)) {
		t.Fatal("the two journals are the end of the output, in order, without a byte lost at the cut")
	}

	entries, _ := os.ReadDir(filepath.Dir(journal))
	if len(entries) != 2 {
		t.Fatalf("nothing but the journal and its older copy: %v", entries)
	}
}
