package migrate_test

import (
	"encoding/json"
	"testing"

	"pupitre.studio/agent/internal/migrate"
)

func TestMigrationTenGivesEveryProcessASpanOfOne(t *testing.T) {
	machine := newSys()
	machine.Files[ledgerPath] = []byte(`{"revision":9,"applied":[]}`)
	machine.Files[installPath] = []byte(`{"modules":["core.system"]}` + "\n")
	machine.Files[projectsPath] = []byte(`{"projects":[` +
		`{"name":"react","processes":[{"id":"web","port":3000,"routes":[]},{"id":"gate","port":3100,"port_span":10,"routes":[]}],"kept":1},` +
		`{"name":"intranet","processes":[{"id":"client","port":3001}]}` +
		`]}` + "\n")

	result, err := runner(machine, migrate.All()...).Run()
	if err != nil || result.Failure != nil || len(result.Applied) != 1 || result.Applied[0].ID != 10 {
		t.Fatalf("result = %+v, err = %v, want the tenth migration alone", result, err)
	}

	var document struct {
		Projects []struct {
			Kept      int              `json:"kept"`
			Processes []map[string]any `json:"processes"`
		} `json:"projects"`
	}

	if err := json.Unmarshal(machine.Files[projectsPath], &document); err != nil {
		t.Fatal(err)
	}

	spans := []any{document.Projects[0].Processes[0]["port_span"], document.Projects[0].Processes[1]["port_span"], document.Projects[1].Processes[0]["port_span"]}
	if spans[0] != float64(1) || spans[1] != float64(10) || spans[2] != float64(1) {
		t.Fatalf("spans = %v, want 1, the 10 already there, 1", spans)
	}

	if document.Projects[0].Kept != 1 {
		t.Fatal("a field the code no longer names must be carried as it is")
	}

	before := string(machine.Files[projectsPath])

	if again, err := runner(machine, migrate.All()...).Run(); err != nil || len(again.Applied) != 0 || string(machine.Files[projectsPath]) != before {
		t.Fatal("a second pass must change nothing")
	}
}

func TestMigrationTenLeavesAMachineWithoutProjectsAlone(t *testing.T) {
	machine := newSys()
	machine.Files[ledgerPath] = []byte(`{"revision":9,"applied":[]}`)
	machine.Files[installPath] = []byte(`{"modules":["core.system"]}` + "\n")

	if result, err := runner(machine, migrate.All()...).Run(); err != nil || len(result.Applied) != 1 {
		t.Fatalf("result = %+v, err = %v", result, err)
	}

	if _, written := machine.Files[projectsPath]; written {
		t.Fatal("no registry, nothing to write")
	}
}
