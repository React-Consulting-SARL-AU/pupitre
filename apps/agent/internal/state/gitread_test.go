package state_test

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/state"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/tmux"
)

type recording struct {
	asMe
	commands *[]sys.Command
}

func (r recording) Run(cmd sys.Command) (sys.Output, error) {
	*r.commands = append(*r.commands, cmd)

	return r.asMe.Run(cmd)
}

// boundedReader reads the fixture's repositories within gitTimeout, and keeps every command it ran.
func boundedReader(t *testing.T, repo fixtureRepo, gitTimeout time.Duration) (*state.Reader, *[]sys.Command) {
	t.Helper()

	base := filepath.Dir(repo.projects)
	commands := &[]sys.Command{}

	return state.New(state.Options{
		Sys:          recording{asMe: asMe{t: t}, commands: commands},
		Now:          modtest.NewClock(time.Millisecond).Now,
		Registry:     modules.NewRegistry(),
		AgentVersion: "0.0.0-test",
		Paths:        registry.Paths{Conf: filepath.Join(base, "projects.conf"), Local: filepath.Join(base, "projects.local.conf"), Projects: repo.projects},
		Tmux:         tmux.Options{User: "root", LogDir: filepath.Join(base, "logs")},
		Sleep:        func(time.Duration) {},
		GitTimeout:   gitTimeout,
	}), commands
}

func TestAPatchPastItsCapIsCutWhileGitWrites(t *testing.T) {
	repo := gitFixture(t)
	write(t, filepath.Join(repo.work, "dump.sql"), strings.Repeat("INSERT INTO flights VALUES (1, 'CDG', 'RAK');\n", 20_000))

	diff, err := repo.reader.Diff("web", "dump.sql")
	if err != nil {
		t.Fatal(err)
	}

	if diff.Problem == "" || len(diff.Patch) != 400_000 || !strings.HasPrefix(diff.Patch, "diff --git") {
		t.Fatalf("problem %q, %d bytes of patch", diff.Problem, len(diff.Patch))
	}
}

func TestEveryGitReadHasItsOwnShortBound(t *testing.T) {
	repo := gitFixture(t)
	reader, commands := boundedReader(t, repo, 7*time.Second)

	if _, err := reader.GitStatus("web"); err != nil {
		t.Fatal(err)
	}

	if _, err := reader.Diff("web", "src/app.ts"); err != nil {
		t.Fatal(err)
	}

	read := 0
	for _, command := range *commands {
		if len(command.Argv) < 4 || command.Argv[0] != "git" || command.Argv[3] == "fetch" {
			continue
		}

		read++
		if command.Timeout != 7*time.Second {
			t.Errorf("%s: bound %s, want the reader's own", strings.Join(command.Argv, " "), command.Timeout)
		}
	}

	if read == 0 {
		t.Fatal("no git read was seen")
	}
}
