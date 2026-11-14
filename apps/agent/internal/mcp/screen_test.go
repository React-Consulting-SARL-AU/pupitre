package mcp_test

import (
	"slices"
	"testing"

	"pupitre.studio/agent/internal/mcp"
)

func TestPlainTextIsLeftAsWritten(t *testing.T) {
	lines := []string{"=== pupitre up 2026-11-14T16:00:17Z ===", "\tat Main.java:12", "ready on 8081"}

	if got := mcp.Plain(lines); !slices.Equal(got, []string{"=== pupitre up 2026-11-14T16:00:17Z ===", "        at Main.java:12", "ready on 8081"}) {
		t.Fatalf("plain = %q", got)
	}
}

func TestColoursAndTitlesAreDropped(t *testing.T) {
	lines := []string{"\x1b[31;1m> Task :server:compileGroovy\x1b[0;39m\x1b[31m FAILED\x1b[39m", "\x1b]0;gradle\x07BUILD FAILED\x1b[?25h"}

	if got := mcp.Plain(lines); !slices.Equal(got, []string{"> Task :server:compileGroovy FAILED", "BUILD FAILED"}) {
		t.Fatalf("plain = %q", got)
	}
}

func TestAProgressLineReadsAsItsLastValue(t *testing.T) {
	lines := []string{"Downloading 10%\rDownloading 55%\rDownloading 100%", "done\r"}

	if got := mcp.Plain(lines); !slices.Equal(got, []string{"Downloading 100%", "done"}) {
		t.Fatalf("plain = %q", got)
	}
}

func TestARedrawnStatusAreaLeavesOnlyWhatStayedOnScreen(t *testing.T) {
	lines := []string{
		"<===> 66% CONFIGURING [1s]\x1b[0K",
		"> :server > Resolve dependencies\x1b[0K",
		"\x1b[2A<===> 66% CONFIGURING [2s]\x1b[0K",
		"> IDLE\x1b[0K",
		"\x1b[2A\x1b[0K",
		"\x1b[1m> Task :server:compileGroovy\x1b[m",
		"startup failed:",
		"AppMessage.groovy: 5: The trait GormEntity is implemented more than once",
		"\x1b[0K",
		"\x1b[0K",
		"\x1b[0K",
		"BUILD FAILED in 30s",
	}

	want := []string{
		"> Task :server:compileGroovy",
		"startup failed:",
		"AppMessage.groovy: 5: The trait GormEntity is implemented more than once",
		"",
		"BUILD FAILED in 30s",
	}

	if got := mcp.Plain(lines); !slices.Equal(got, want) {
		t.Fatalf("plain = %q", got)
	}
}

func TestAMoveAboveTheFirstLineStaysOnIt(t *testing.T) {
	if got := mcp.Plain([]string{"\x1b[9Aabc\x1b[2D\x1b[KZ"}); !slices.Equal(got, []string{"aZ"}) {
		t.Fatalf("plain = %q", got)
	}
}
