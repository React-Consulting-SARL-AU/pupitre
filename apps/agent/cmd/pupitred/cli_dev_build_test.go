//go:build dev

package main

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
)

// The development build carries its own entitlement, so hello answers dev whatever the disk says.
const buildEntitlement = contract.EntitlementDev

func TestTheDevelopmentBuildInstallsWithoutAToken(t *testing.T) {
	fake, _ := setupCLI(t)
	unenrol(fake)

	code, _, stderr := runCLI(t, "install", "--only=tool.demo")
	if code != 0 || strings.Contains(stderr, "entitlement_required") {
		t.Fatalf("code = %d, stderr:\n%s", code, stderr)
	}
}
