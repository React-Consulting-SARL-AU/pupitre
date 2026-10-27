package state_test

import (
	"errors"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/state"
)

// React-Box's gateway answers on 3000 and its backends on the ports after it, which nobody declared.
func gateway(t *testing.T) (*modtest.FakeSys, *state.Reader) {
	t.Helper()

	fake := modtest.NewFakeSys()
	machine(fake)
	fake.Files[registry.DefaultConf] = []byte("react|react|-|bun|127.0.0.1|3000|-|bun run dev\nintranet|intranet|-|bun|127.0.0.1|3001|-|bun run dev\n")
	fake.Dirs["/home/dev/projects/react"] = true
	fake.Dirs["/home/dev/projects/intranet"] = true
	fake.Serves("react/react", 3000)
	fake.AlsoServes("react/react", 3001)

	return fake, newReader(t, fake, modules.NewRegistry(), func(time.Duration) {})
}

func TestAPortAnotherProjectHoldsDoesNotReadAsAnExternalStart(t *testing.T) {
	_, reader := gateway(t)

	if _, err := reader.Up("react", ""); err != nil {
		t.Fatal(err)
	}

	projects := reader.Snapshot().Projects

	if got := projectOf(t, projects, "intranet").State; got != contract.ProjectStopped {
		t.Fatalf("intranet answers only through react's backend, got %s", got)
	}

	if got := projectOf(t, projects, "react").State; got != contract.ProjectOnline {
		t.Fatalf("react holds its own port, got %s", got)
	}
}

func TestARunningProcessWhosePortAnotherProjectHoldsIsNotOnline(t *testing.T) {
	_, reader := gateway(t)

	if _, err := reader.Up("intranet", ""); err != nil {
		t.Fatal(err)
	}

	if _, err := reader.Up("react", ""); err != nil {
		t.Fatal(err)
	}

	if got := processOf(t, projectOf(t, reader.Snapshot().Projects, "intranet"), "intranet").State; got == contract.ProcessOnline {
		t.Fatal("intranet reads online on a port react holds")
	}
}

func TestStartingOnAPortAnotherProjectHoldsIsRefusedWithAFreeOne(t *testing.T) {
	fake, reader := gateway(t)

	if _, err := reader.Up("react", ""); err != nil {
		t.Fatal(err)
	}

	_, err := reader.Up("intranet", "")

	var refusal *protocol.Error
	if !errors.As(err, &refusal) || refusal.Code != contract.ErrorBadRequest {
		t.Fatalf("got %v", err)
	}

	if !strings.Contains(refusal.Message, "react/react") || !strings.Contains(refusal.Fix, "3002") {
		t.Fatalf("the refusal must name the holder and a free port: %s / %s", refusal.Message, refusal.Fix)
	}

	if _, opened := fake.Windows["intranet/intranet"]; opened {
		t.Fatal("intranet was started on a port react holds")
	}
}

func TestAPortHeldOutsidePupitreStillStarts(t *testing.T) {
	fake, reader := gateway(t)
	fake.Listen[3001] = true

	if _, err := reader.Up("intranet", ""); err != nil {
		t.Fatalf("a listener no project window owns is not Pupitre's to judge: %v", err)
	}
}

func TestDeclaringAPortAnotherProjectHoldsWarns(t *testing.T) {
	fake, reader := gateway(t)
	fake.Files[registry.DefaultConf] = []byte("react|react|-|bun|127.0.0.1|3000|-|bun run dev\n")

	if _, err := reader.Up("react", ""); err != nil {
		t.Fatal(err)
	}

	project, processes := declared("billing", 3001, "bun run dev")

	answer, err := reader.Add(project, processes)
	if err != nil {
		t.Fatal(err)
	}

	if len(answer.Warnings) != 1 || !strings.Contains(answer.Warnings[0], "react/react") || !strings.Contains(answer.Warnings[0], "3002") {
		t.Fatalf("warnings = %q", answer.Warnings)
	}
}
