package state_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/state"
	"pupitre.studio/agent/internal/tmux"
)

// Root's file that a link planted by dev points at: reading through the link would hand it to dev.
const stolenManifest = `{"name":"stolen","scripts":{"dev":"vite --port 4999"}}`

func plant(t *testing.T, target, link string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
}

func detectorAt(t *testing.T, base string) *state.Reader {
	t.Helper()

	return state.New(state.Options{
		Sys:          asMe{t: t},
		Now:          modtest.NewClock(time.Millisecond).Now,
		Registry:     modules.NewRegistry(),
		AgentVersion: "0.0.0-test",
		Paths:        registry.Paths{Conf: filepath.Join(base, "projects.conf"), Local: filepath.Join(base, "projects.local.conf"), Projects: filepath.Join(base, "projects")},
		Tmux:         tmux.Options{User: "root", LogDir: filepath.Join(base, "logs")},
		Detect:       state.DetectOptions{Cache: filepath.Join(base, "cache"), Name: func() string { return "detection" }},
		Sleep:        func(time.Duration) {},
	})
}

func readNothingStolen(t *testing.T, detected contract.ProjectDetect) {
	t.Helper()

	for _, process := range detected.Processes {
		if process.ID == "stolen" || process.PortHint == 4999 {
			t.Fatalf("root followed a link out of the repository: %+v", process)
		}
	}
}

func TestSnapshotBranchNeverFollowsALinkOutOfTheProjectsRoot(t *testing.T) {
	base := t.TempDir()
	projects := filepath.Join(base, "projects")
	secret := filepath.Join(base, "outside", "HEAD")
	write(t, secret, "ref: refs/heads/stolen\n")

	reader := readerAt(t, base, projects)

	write(t, filepath.Join(projects, "web", ".git", "HEAD"), "ref: refs/heads/main\n")
	if branch := reader.List()[0].Branch; branch != "main" {
		t.Fatalf("a HEAD of the repository's own reads as its branch, got %q", branch)
	}

	if err := os.Remove(filepath.Join(projects, "web", ".git", "HEAD")); err != nil {
		t.Fatal(err)
	}
	plant(t, secret, filepath.Join(projects, "web", ".git", "HEAD"))

	if branch := reader.List()[0].Branch; branch == "stolen" {
		t.Fatal("root read the branch through a link that leaves the projects root")
	}
}

func TestDetectInAFolderNeverFollowsALinkOutOfTheProjectsRoot(t *testing.T) {
	base := t.TempDir()
	secret := filepath.Join(base, "outside", "package.json")
	write(t, secret, stolenManifest)
	plant(t, secret, filepath.Join(base, "projects", "candidate", "package.json"))

	detected, err := detectorAt(t, base).Detect("", "candidate", "")
	if err != nil {
		t.Fatal(err)
	}

	readNothingStolen(t, detected)
}

func TestDetectRefusesAProjectFolderThatIsALinkOutOfTheProjectsRoot(t *testing.T) {
	base := t.TempDir()
	write(t, filepath.Join(base, "outside", "package.json"), stolenManifest)
	if err := os.MkdirAll(filepath.Join(base, "projects"), 0o755); err != nil {
		t.Fatal(err)
	}
	plant(t, filepath.Join(base, "outside"), filepath.Join(base, "projects", "candidate"))

	detected, err := detectorAt(t, base).Detect("", "candidate", "")

	failure, refused := err.(*protocol.Error)
	if !refused || failure.Code != contract.ErrorBadRequest {
		t.Fatalf("a project folder leading out of the projects root reads as absent, got %v and %+v", err, detected)
	}
}

func TestDetectInAFolderNeverFollowsAWorkspaceGlobOutOfTheProjectsRoot(t *testing.T) {
	base := t.TempDir()
	write(t, filepath.Join(base, "outside", "web", "package.json"), stolenManifest)
	write(t, filepath.Join(base, "projects", "candidate", "turbo.json"), `{"tasks":{"dev":{}}}`)
	write(t, filepath.Join(base, "projects", "candidate", "package.json"), `{"name":"atlas","workspaces":["../../outside/*"]}`)

	detected, err := detectorAt(t, base).Detect("", "candidate", "")
	if err != nil {
		t.Fatal(err)
	}

	for _, process := range detected.Processes {
		for _, route := range process.Routes {
			if route.Port == 4999 {
				t.Fatalf("a workspace glob led root out of the repository: %+v", process)
			}
		}
	}
}

func TestDetectOfAClonedRepositoryNeverFollowsALinkItCarries(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}

	base := t.TempDir()
	secret := filepath.Join(base, "outside", "package.json")
	write(t, secret, stolenManifest)

	origin := filepath.Join(base, "trap.git")
	run(t, base, "git", "init", "--quiet", "--bare", "--initial-branch=main", origin)

	seed := filepath.Join(base, "seed")
	run(t, base, "git", "clone", "--quiet", origin, seed)
	plant(t, secret, filepath.Join(seed, "package.json"))
	run(t, seed, "git", "add", "-A")
	run(t, seed, "git", "commit", "--quiet", "-m", "trap")
	run(t, seed, "git", "push", "--quiet", "origin", "main")

	detected, err := detectorAt(t, base).Detect("file://"+origin, "", "")
	if err != nil {
		t.Fatal(err)
	}

	readNothingStolen(t, detected)
}
