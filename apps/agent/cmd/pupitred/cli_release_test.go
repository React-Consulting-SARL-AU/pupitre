//go:build !dev

package main

import (
	"strings"
	"testing"
)

func TestInstallRefusesOnAReleaseBuildWithoutEntitlement(t *testing.T) {
	fake, _ := setupCLI(t)

	code, _, stderr := runCLI(t, "install", "--only=tool.demo")
	if code != 1 || !strings.Contains(stderr, "entitlement_required") {
		t.Fatalf("code = %d, stderr:\n%s", code, stderr)
	}

	if len(fake.Calls) != 0 || len(fake.Mutations) != 0 {
		t.Fatalf("the machine was touched without entitlement: %v", fake.Commands())
	}

	t.Logf("pupitred install (release build):\n%s", stderr)
}
