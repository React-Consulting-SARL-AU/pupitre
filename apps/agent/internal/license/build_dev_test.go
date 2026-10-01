//go:build dev

package license_test

import (
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/license"
	"pupitre.studio/agent/internal/modules/modtest"
)

func TestTheDevelopmentBuildNeedsNeitherTokenNorPlatform(t *testing.T) {
	state := license.New(license.Options{Sys: modtest.NewFakeSys()}).State()

	if state.License != contract.LicenseDev || !state.Enrolled {
		t.Fatalf("state = %+v", state)
	}

	for _, cmd := range []string{"install", "project.up", "keys.sync", "secrets.set"} {
		if !state.Allows(cmd) {
			t.Errorf("%s refused in a development build", cmd)
		}
	}
}
