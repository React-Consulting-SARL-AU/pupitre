package migrate_test

import (
	"encoding/json"
	"testing"

	"pupitre.studio/agent/internal/migrate"
)

func TestMigrationNineDropsTheGallerySubdomainAndNothingElse(t *testing.T) {
	machine := newSys()
	machine.Files[ledgerPath] = []byte(`{"revision":8,"applied":[]}`)
	machine.Files[installPath] = []byte(`{"modules":["core.system","ai.browser","ai.claude"],"config":{` +
		`"ai.browser":{"subdomain":"shots","kept":1},` +
		`"ai.claude":{"subdomain":"not-ours"}` +
		`},"secrets":{"ai.browser":{}}}` + "\n")

	result, err := runner(machine, migrate.All()...).Run()
	if err != nil || result.Failure != nil || len(result.Applied) != 2 || result.Applied[0].ID != 9 {
		t.Fatalf("result = %+v, err = %v, want the ninth migration first", result, err)
	}

	var document struct {
		Config  map[string]map[string]any `json:"config"`
		Secrets map[string]any            `json:"secrets"`
	}

	if err := json.Unmarshal(machine.Files[installPath], &document); err != nil {
		t.Fatal(err)
	}

	if got, _ := json.Marshal(document.Config["ai.browser"]); string(got) != `{"kept":1}` {
		t.Fatalf("ai.browser = %s, want its other values untouched", got)
	}

	if got, _ := json.Marshal(document.Config["ai.claude"]); string(got) != `{"subdomain":"not-ours"}` {
		t.Fatalf("ai.claude = %s, another module's field is not this migration's", got)
	}

	if _, kept := document.Secrets["ai.browser"]; !kept {
		t.Fatal("a field the code no longer names must be carried as it is")
	}

	before := string(machine.Files[installPath])

	if again, err := runner(machine, migrate.All()...).Run(); err != nil || len(again.Applied) != 0 || string(machine.Files[installPath]) != before {
		t.Fatal("a second pass must change nothing")
	}
}

func TestMigrationNineLeavesABrowserWithoutGalleryAlone(t *testing.T) {
	machine := newSys()
	machine.Files[ledgerPath] = []byte(`{"revision":8,"applied":[]}`)
	untouched := `{"modules":["ai.browser"],"config":{"ai.browser":{}}}` + "\n"
	machine.Files[installPath] = []byte(untouched)

	if _, err := runner(machine, migrate.All()...).Run(); err != nil {
		t.Fatal(err)
	}

	if got := string(machine.Files[installPath]); got != untouched {
		t.Fatalf("install.json = %q, want it byte for byte", got)
	}
}
