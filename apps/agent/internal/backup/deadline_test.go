package backup

import (
	"testing"
	"time"
)

func TestADownloadIsBoundedAndGrowsWithThePart(t *testing.T) {
	small, large := partDeadline(1<<10), partDeadline(10<<30)

	if small != partFloor || large <= small || large > 12*time.Hour {
		t.Fatalf("deadlines %s and %s", small, large)
	}

	if manifestDeadline > 5*time.Minute {
		t.Fatalf("a manifest is kilobytes: %s", manifestDeadline)
	}
}
