package state_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/state"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/tmux"
)

// The real machine, minus the user switch: the tests run as whoever runs go test, and git is the point of the fixture.
type asMe struct {
	sys.Real
}

func (a asMe) Run(cmd sys.Command) (sys.Output, error) {
	cmd.User = ""
	cmd.Env = append(cmd.Env, "HOME="+os.Getenv("HOME"))

	return a.Real.Run(cmd)
}

type fixtureRepo struct {
	origin   string
	projects string
	work     string
	reader   *state.Reader
}

func run(t *testing.T, dir string, argv ...string) string {
	t.Helper()

	command := exec.Command(argv[0], argv[1:]...)
	command.Dir = dir
	command.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Pupitre", "GIT_AUTHOR_EMAIL=test@pupitre.studio",
		"GIT_COMMITTER_NAME=Pupitre", "GIT_COMMITTER_EMAIL=test@pupitre.studio",
		"GIT_CONFIG_NOSYSTEM=1", "LC_ALL=C",
	)

	out, err := command.Output()
	if err != nil {
		t.Fatalf("%s in %s: %v", strings.Join(argv, " "), dir, err)
	}

	return strings.TrimRight(string(out), "\n")
}

func write(t *testing.T, path, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

// A remote with one commit ahead, a local commit that is not pushed, a tracked file changed and an untracked one: the four readings git_status has to tell apart.
func gitFixture(t *testing.T) fixtureRepo {
	t.Helper()

	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}

	base := t.TempDir()
	origin := filepath.Join(base, "origin.git")
	projects := filepath.Join(base, "projects")
	work := filepath.Join(projects, "web")

	run(t, base, "git", "init", "--quiet", "--bare", "--initial-branch=main", origin)

	seed := filepath.Join(base, "seed")
	run(t, base, "git", "clone", "--quiet", origin, seed)
	write(t, filepath.Join(seed, "README.md"), "flymate\n")
	write(t, filepath.Join(seed, "src/app.ts"), "export const app = 1\n")
	run(t, seed, "git", "add", "-A")
	run(t, seed, "git", "commit", "--quiet", "-m", "premier jet")
	run(t, seed, "git", "push", "--quiet", "origin", "main")

	if err := os.MkdirAll(projects, 0o755); err != nil {
		t.Fatal(err)
	}
	run(t, base, "git", "clone", "--quiet", origin, work)

	write(t, filepath.Join(seed, "CHANGELOG.md"), "0.1.0\n")
	run(t, seed, "git", "add", "-A")
	run(t, seed, "git", "commit", "--quiet", "-m", "le journal des versions")
	run(t, seed, "git", "push", "--quiet", "origin", "main")

	write(t, filepath.Join(work, "src/api.ts"), "export const api = 2\n")
	run(t, work, "git", "add", "-A")
	run(t, work, "git", "commit", "--quiet", "-m", "une route de plus")

	write(t, filepath.Join(work, "src/app.ts"), "export const app = 42\nexport const extra = true\n")
	write(t, filepath.Join(work, "notes.md"), "à trier\ndemain\n")

	conf := filepath.Join(base, "projects.conf")
	write(t, conf, "web|web|"+origin+"|none|127.0.0.1|3000|web|sleep 1\nfresh|fresh|"+origin+"|none|127.0.0.1|3100|-|sleep 1\n")

	reader := state.New(state.Options{
		Sys:          asMe{},
		Now:          modtest.NewClock(time.Millisecond).Now,
		Registry:     modules.NewRegistry(),
		AgentVersion: "0.0.0-test",
		Paths:        registry.Paths{Conf: conf, Local: filepath.Join(base, "projects.local.conf"), Projects: projects},
		Tmux:         tmux.Options{User: "root", LogDir: filepath.Join(base, "logs")},
		Sleep:        func(time.Duration) {},
	})

	return fixtureRepo{origin: origin, projects: projects, work: work, reader: reader}
}

func TestGitStatusTellsBehindAheadAndDirtyApart(t *testing.T) {
	repo := gitFixture(t)

	status, err := repo.reader.GitStatus("web")
	if err != nil {
		t.Fatal(err)
	}

	if !status.Repo || status.Current != "main" || status.Upstream != "origin/main" {
		t.Fatalf("unexpected head %+v", status)
	}

	if status.Behind != 1 || status.Ahead != 1 {
		t.Fatalf("got behind %d ahead %d, want one each", status.Behind, status.Ahead)
	}

	if !status.Dirty {
		t.Fatal("a tracked file was changed: the repository is dirty")
	}

	// One tracked change and one untracked file, where dirty only counts the tracked one.
	if status.Changed != 2 {
		t.Fatalf("got %d changed files, want the modified one and the untracked one", status.Changed)
	}

	if status.Subject != "le journal des versions" || status.Last == 0 {
		t.Fatalf("the last commit read must be the upstream one: %+v", status)
	}

	if status.Problem != "" {
		t.Fatalf("a reachable remote leaves no problem: %q", status.Problem)
	}
}

func TestGitStatusReportsAnUnreachableRemote(t *testing.T) {
	repo := gitFixture(t)
	run(t, repo.work, "git", "remote", "set-url", "origin", filepath.Join(repo.projects, "nowhere.git"))

	status, err := repo.reader.GitStatus("web")
	if err != nil {
		t.Fatal(err)
	}

	if status.Problem == "" {
		t.Fatal("an unreachable remote must be reported in problem")
	}

	if strings.Contains(status.Problem, "\n") {
		t.Fatalf("problem is one line: %q", status.Problem)
	}

	if !status.Repo || status.Current != "main" {
		t.Fatalf("what git knows without the network is still read: %+v", status)
	}
}

func TestDiffIsGitsOwnPatchByteForByte(t *testing.T) {
	repo := gitFixture(t)

	want := run(t, repo.work, "git", "diff", "--no-color", "--unified=3", "HEAD", "--", "./src/app.ts")

	diff, err := repo.reader.Diff("web", "src/app.ts")
	if err != nil {
		t.Fatal(err)
	}

	if strings.TrimRight(diff.Patch, "\n") != want {
		t.Fatalf("the patch is git's own, uninterpreted\n got: %q\nwant: %q", diff.Patch, want)
	}

	if diff.Binary || diff.Problem != "" {
		t.Fatalf("unexpected %+v", diff)
	}
}

func TestDiffOfAnUntrackedFileComparesAgainstNothing(t *testing.T) {
	repo := gitFixture(t)

	diff, err := repo.reader.Diff("web", "notes.md")
	if err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(diff.Patch, "+à trier") || !strings.Contains(diff.Patch, "/dev/null") {
		t.Fatalf("unexpected patch %q", diff.Patch)
	}
}

func TestDiffRefusesAPathGitMustNeverSee(t *testing.T) {
	repo := gitFixture(t)

	for _, path := range []string{"../etc/passwd", "/etc/passwd", `src/"app".ts`} {
		diff, err := repo.reader.Diff("web", path)
		if err != nil {
			t.Fatal(err)
		}

		if diff.Problem == "" || diff.Patch != "" {
			t.Errorf("%q must be refused: %+v", path, diff)
		}
	}
}

func TestWorkingTreeListsEveryStageWithItsCounts(t *testing.T) {
	repo := gitFixture(t)
	run(t, repo.work, "git", "add", "README.md")
	write(t, filepath.Join(repo.work, "README.md"), "flymate\nune ligne de plus\n")
	run(t, repo.work, "git", "add", "README.md")

	tree, err := repo.reader.WorkingTree("web")
	if err != nil {
		t.Fatal(err)
	}

	if !tree.Repo || tree.Branch != "main" || tree.Upstream != "origin/main" {
		t.Fatalf("unexpected head %+v", tree)
	}

	stages := map[string]contract.FileChange{}
	for _, change := range tree.Files {
		stages[change.Path] = change
	}

	if stages["README.md"].Stage != contract.StageStaged || stages["README.md"].Added != 1 {
		t.Errorf("unexpected staged file %+v", stages["README.md"])
	}

	if stages["src/app.ts"].Stage != contract.StageUnstaged || stages["src/app.ts"].Added != 2 || stages["src/app.ts"].Removed != 1 {
		t.Errorf("unexpected unstaged file %+v", stages["src/app.ts"])
	}

	if stages["notes.md"].Stage != contract.StageUntracked || stages["notes.md"].Added != 2 {
		t.Errorf("unexpected untracked file %+v", stages["notes.md"])
	}

	if tree.Files[0].Stage != contract.StageStaged || tree.Files[len(tree.Files)-1].Stage != contract.StageUntracked {
		t.Fatalf("staged first, untracked last: %+v", tree.Files)
	}
}

func TestBranchesListsWhatIsLocalAndWhatIsOnTheRemote(t *testing.T) {
	repo := gitFixture(t)
	run(t, repo.work, "git", "branch", "feat/login")

	branches, err := repo.reader.Branches("web")
	if err != nil {
		t.Fatal(err)
	}

	if !branches.Repo || branches.Current != "main" || !branches.Dirty {
		t.Fatalf("unexpected %+v", branches)
	}

	if strings.Join(branches.Local, ",") != "feat/login,main" {
		t.Fatalf("unexpected local branches %v", branches.Local)
	}

	if strings.Join(branches.Remote, ",") != "main" {
		t.Fatalf("unexpected remote branches %v", branches.Remote)
	}
}

func TestCheckoutRefusesToCarryUncommittedWorkAway(t *testing.T) {
	repo := gitFixture(t)

	if _, err := repo.reader.Checkout("web", "feat/login"); err == nil {
		t.Fatal("a dirty repository must never be switched")
	}

	run(t, repo.work, "git", "checkout", "--quiet", "--", "src/app.ts")
	if err := os.Remove(filepath.Join(repo.work, "notes.md")); err != nil {
		t.Fatal(err)
	}

	branch, err := repo.reader.Checkout("web", "feat/login")
	if err != nil {
		t.Fatal(err)
	}

	if branch != "feat/login" {
		t.Fatalf("got %q", branch)
	}

	if head := run(t, repo.work, "git", "rev-parse", "--abbrev-ref", "HEAD"); head != "feat/login" {
		t.Fatalf("the repository is on %q", head)
	}
}

func TestCheckoutRefusesABranchNameGitMustNeverSee(t *testing.T) {
	repo := gitFixture(t)

	if _, err := repo.reader.Checkout("web", "--orphan"); err == nil {
		t.Fatal("an option must never pass for a branch name")
	}
}

func TestSyncClonesWhatIsMissingAndPullsWhatIsThere(t *testing.T) {
	repo := gitFixture(t)

	fresh, err := repo.reader.Sync("fresh")
	if err != nil {
		t.Fatal(err)
	}

	if !fresh.Pulled || fresh.Installed {
		t.Fatalf("a missing folder is cloned, and pkgmgr none installs nothing: %+v", fresh)
	}

	if _, err := os.Stat(filepath.Join(repo.projects, "fresh", ".git")); err != nil {
		t.Fatalf("the repository must have been cloned: %v", err)
	}

	web, err := repo.reader.Sync("web")
	if err != nil {
		t.Fatal(err)
	}

	if !web.Pulled {
		t.Fatalf("unexpected %+v", web)
	}

	after, err := repo.reader.GitStatus("web")
	if err != nil {
		t.Fatal(err)
	}

	if after.Behind != 0 || after.Ahead != 1 {
		t.Fatalf("the pull rebased the local commit onto the remote: %+v", after)
	}
}
