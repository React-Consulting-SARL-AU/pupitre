//go:build dev

package entitlement_test

import (
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/modules/modtest"
)

func TestTheDevelopmentBuildNeedsNeitherTokenNorPlatform(t *testing.T) {
	state := entitlement.New(entitlement.Options{Sys: modtest.NewFakeSys()}).State()

	if state.Entitlement != contract.EntitlementDev || !state.Enrolled {
		t.Fatalf("state = %+v", state)
	}

	for _, cmd := range []string{"install", "project.up", "keys.sync", "secrets.set"} {
		if !state.Allows(cmd) {
			t.Errorf("%s refused in a development build", cmd)
		}
	}
}
