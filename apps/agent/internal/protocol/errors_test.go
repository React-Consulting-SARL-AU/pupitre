package protocol

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/platform"
)

func TestTheEntitlementRefusalSendsTheClientToTheSharedConsole(t *testing.T) {
	refusal := EntitlementRequired()

	if !strings.Contains(refusal.Fix, platform.Console("")) || strings.Contains(refusal.Fix, "%") {
		t.Fatalf("fix = %q", refusal.Fix)
	}
}
