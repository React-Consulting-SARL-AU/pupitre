package protocol

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/platform"
)

func TestTheLicenseRefusalSendsTheClientToTheSharedConsole(t *testing.T) {
	refusal := LicenseRequired()

	if !strings.Contains(refusal.Fix, platform.Console("")) || strings.Contains(refusal.Fix, "%") {
		t.Fatalf("fix = %q", refusal.Fix)
	}
}
