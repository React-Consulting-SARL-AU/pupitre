package modules

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestAJournalHeldForADaemonsLifeKeepsOnlyItsLastLinesInMemory(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pupitre.log")
	j := openJournal(path, time.Now)
	defer j.close()

	for i := range 3 * memoryLines {
		j.logf("pupitred", "line %d", i)
	}

	kept := j.lines()
	if len(kept) > memoryLines || !strings.HasSuffix(kept[len(kept)-1], fmt.Sprintf("line %d", 3*memoryLines-1)) {
		t.Fatalf("kept %d lines, the last %q", len(kept), kept[len(kept)-1])
	}

	written, err := os.ReadFile(path)
	if err != nil || strings.Count(string(written), "\n") != 3*memoryLines {
		t.Fatalf("the file keeps every line: %v", err)
	}
}

func TestASecretHiddenTwiceIsKeptOnce(t *testing.T) {
	j := openJournal("", time.Now)

	for range 100 {
		j.hide("s3cret")
	}

	j.logf("pupitred", "token s3cret")

	if len(j.secrets) != 1 || strings.Contains(j.lines()[0], "s3cret") {
		t.Fatalf("secrets = %d, line %q", len(j.secrets), j.lines()[0])
	}
}
