package catalog_test

import (
	"encoding/json"
	"slices"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
)

/*
What this file proves: the registry the binary ships is the catalogue the
contract names, no more and no less. A module is registered by being imported
from its category package, and a package written but never imported is a
module the app offers and the agent refuses as unknown.
*/

func TestTheRegistryIsTheCatalogueOfTheContract(t *testing.T) {
	raw, found := contract.Definition("ModuleIds")
	if !found {
		t.Fatal("schema.json exports no ModuleIds")
	}

	var exported struct {
		Const []string `json:"const"`
	}
	if err := json.Unmarshal(raw, &exported); err != nil {
		t.Fatalf("decode ModuleIds: %v", err)
	}

	registered := []string{}
	for _, module := range modules.Default().All() {
		registered = append(registered, module.Manifest().ID)
	}

	slices.Sort(registered)
	slices.Sort(exported.Const)

	if !slices.Equal(registered, exported.Const) {
		t.Fatalf("the registry holds %v, the contract names %v", registered, exported.Const)
	}
}
