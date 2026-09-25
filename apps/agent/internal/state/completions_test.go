package state_test

import (
	"errors"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/protocol"
)

func TestCompletionsCarryTheGrammarTheProjectsAndTheRoot(t *testing.T) {
	_, reader := fixture(t)

	completions, err := reader.Completions("")
	if err != nil {
		t.Fatal(err)
	}

	if err := contract.ValidateValue("CompletionsResult", completions); err != nil {
		t.Fatalf("completions violate the contract: %v", err)
	}

	if completions.Command != devcli.Command || completions.Root != "/home/dev/projects" || completions.Path != "" {
		t.Fatalf("unexpected header: %+v", completions)
	}

	if strings.Join(completions.Projects, " ") != "web shots" {
		t.Fatalf("the projects must come from the registry, in its order: %v", completions.Projects)
	}

	verbs := map[string]bool{}

	for _, sub := range completions.Sub {
		verbs[sub.Name] = true
	}

	for _, verb := range []string{"up", "down", "restart", "status", "logs", "sync", "attach", "branch", "db", "doctor"} {
		if !verbs[verb] {
			t.Errorf("the grammar lacks %q", verb)
		}
	}
}

func TestCompletionsListAFolderOfTheProjectsRoot(t *testing.T) {
	fake, reader := fixture(t)
	fake.Dirs["/home/dev/projects/web/src"] = true
	fake.Files["/home/dev/projects/web/package.json"] = []byte("{}\n")
	fake.Files["/home/dev/projects/web/.env.local"] = []byte("PORT=3000\n")

	root, err := reader.Completions("")
	if err != nil {
		t.Fatal(err)
	}

	if strings.Join(root.Paths, " ") != "web/" {
		t.Fatalf("the root lists its folders: %v", root.Paths)
	}

	inside, err := reader.Completions("web")
	if err != nil {
		t.Fatal(err)
	}

	if inside.Path != "web" || strings.Join(inside.Paths, " ") != ".env.local package.json src/" {
		t.Fatalf("unexpected listing: %+v", inside)
	}
}

func TestCompletionsAnswerAnAbsentFolderWithAnEmptyList(t *testing.T) {
	_, reader := fixture(t)

	completions, err := reader.Completions("web/absent")
	if err != nil {
		t.Fatal(err)
	}

	if len(completions.Paths) != 0 || completions.Path != "web/absent" {
		t.Fatalf("unexpected listing: %+v", completions)
	}
}

func TestCompletionsNeverLeaveTheProjectsRoot(t *testing.T) {
	fake, reader := fixture(t)
	fake.Files["/etc/pupitre/env"] = []byte("GITHUB_TOKEN=ghp_x\n")

	for _, wanted := range []string{"/etc/pupitre", "../../etc/pupitre", "web/../../../etc", ".."} {
		completions, err := reader.Completions(wanted)

		var failure *protocol.Error
		if !errors.As(err, &failure) || failure.Code != contract.ErrorBadRequest {
			t.Fatalf("%q must be refused, got %+v %v", wanted, completions, err)
		}

		if failure.Fix == "" {
			t.Errorf("%q is refused without a fix", wanted)
		}
	}

	// "." and a trailing slash designate the root itself, and are not an escape.
	for _, wanted := range []string{".", "web/", "./web"} {
		if _, err := reader.Completions(wanted); err != nil {
			t.Fatalf("%q must be accepted: %v", wanted, err)
		}
	}
}
