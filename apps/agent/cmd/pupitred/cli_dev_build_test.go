//go:build dev

package main

import (
	"pupitre.studio/agent/internal/modules"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
)

// The development build carries its own license, so hello answers dev whatever the disk says.
const buildLicense = contract.LicenseDev

func TestTheDevelopmentBuildInstallsWithoutAToken(t *testing.T) {
	fake, dir := setupCLI(t)
	unenrol(fake)
	writeInstallJSON(t, dir, modules.Request{
		Modules: []string{"tool.demo"},
		Secrets: map[string]map[string]string{"tool.demo": {"password": "s3cret-de-test"}},
	})

	code, _, stderr := runCLI(t, "install", "--only=tool.demo")
	if code != 0 || strings.Contains(stderr, "license_required") {
		t.Fatalf("code = %d, stderr:\n%s", code, stderr)
	}
}
