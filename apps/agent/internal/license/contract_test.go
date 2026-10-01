package license

import (
	"encoding/json"
	"slices"
	"testing"

	"pupitre.studio/agent/internal/contract"
)

func TestTheCacheKnowsEveryLicenseThePlatformGrants(t *testing.T) {
	var state struct {
		Properties struct {
			License struct {
				Enum []string `json:"enum"`
			} `json:"license"`
		} `json:"properties"`
	}

	raw, ok := contract.Definition("AgentState")
	if !ok {
		t.Fatal("AgentState is not in the contract")
	}
	if err := json.Unmarshal(raw, &state); err != nil {
		t.Fatal(err)
	}

	known := []string{platformValid, platformGrace, platformSuspended}
	if !slices.Equal(state.Properties.License.Enum, known) {
		t.Fatalf("contract %v, cache %v", state.Properties.License.Enum, known)
	}
}
