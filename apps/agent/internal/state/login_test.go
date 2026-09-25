package state_test

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/tool/github"
	"pupitre.studio/agent/internal/state"
)

func TestServiceStatusAsksTheCliWhoIsSignedInAndTheSnapshotDoesNot(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Packages["gh"] = "2.80.0"
	fake.Files["/etc/pupitre/env"] = []byte("GITHUB_TOKEN=s3cret\n")
	fake.Answer("gh auth status", `{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"flyleaf"}]}}`)

	registry := modules.NewRegistry()
	registry.Register(github.Module{})
	registry.Register(modtest.Passing{ID: "core.system"})
	fake.Packages["core-system"] = "1.0"

	reader := state.New(state.Options{Sys: fake, Registry: registry})

	snapshot := reader.Snapshot()

	for _, service := range snapshot.Services {
		if service.Login != nil {
			t.Fatalf("%s carries a login in the snapshot", service.ID)
		}
	}

	if asked := strings.Join(fake.Commands(), "\n"); strings.Contains(asked, "gh auth status") {
		t.Fatalf("the snapshot asked gh:\n%s", asked)
	}

	status, err := reader.ServiceStatus(github.ID)
	if err != nil {
		t.Fatal(err)
	}

	if status.Login == nil || *status.Login != (contract.Login{State: contract.LoginSignedIn, Account: "flyleaf"}) {
		t.Fatalf("login = %+v", status.Login)
	}

	if err := contract.ValidateValue("ServiceStatusResult", status); err != nil {
		t.Fatal(err)
	}

	plain, err := reader.ServiceStatus("core.system")
	if err != nil {
		t.Fatal(err)
	}

	if plain.Login != nil {
		t.Fatalf("a module without an account says nothing of one: %+v", plain.Login)
	}
}
