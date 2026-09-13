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

// A git that answers the same on every machine: no system or global configuration to read,
// an identity of its own, and one language. Without it a developer's ~/.gitconfig decides
// what a reading says, and a runner that has none reads something else.
var gitEnv = []string{
	"GIT_AUTHOR_NAME=Pupitre", "GIT_AUTHOR_EMAIL=test@pupitre.studio",
	"GIT_COMMITTER_NAME=Pupitre", "GIT_COMMITTER_EMAIL=test@pupitre.studio",
	"GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=/dev/null", "LC_ALL=C",
}

// The real machine, minus the user switch: the tests run as whoever runs go test, and git is the point of the fixture.
type asMe struct {
	sys.Real
	t *testing.T
}

func (a asMe) Run(cmd sys.Command) (sys.Output, error) {
	cmd.User = ""
	cmd.Env = append(cmd.Env, "HOME="+os.Getenv("HOME"))
	cmd.Env = append(cmd.Env, gitEnv...)

	out, err := a.Real.Run(cmd)
	if err != nil && a.t != nil {
		a.t.Logf("%s: %v\n%s", strings.Join(cmd.Argv, " "), err, out.Stderr)
	}

	return out, err
}

// Handing a folder to another user is root's move, like the user switch: here everything already belongs to whoever runs go test.
func (asMe) Chown(string, string, string) error {
	return nil
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
	command.Env = append(os.Environ(), gitEnv...)

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
		Sys:          asMe{t: t},
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

// The app fetches and installs as two phases, so the clone must be askable on its own.
func TestPullClonesWithoutInstalling(t *testing.T) {
	repo := gitFixture(t)

	pulled, err := repo.reader.Pull("fresh")
	if err != nil {
		t.Fatal(err)
	}

	if !pulled.Pulled || pulled.State != "stopped" {
		t.Fatalf("unexpected %+v", pulled)
	}

	if _, err := os.Stat(filepath.Join(repo.projects, "fresh", ".git")); err != nil {
		t.Fatalf("the repository must have been cloned: %v", err)
	}

	if _, err := os.Stat(filepath.Join(repo.projects, "fresh", "node_modules")); err == nil {
		t.Fatal("a pull installs nothing")
	}
}

// A row that names a branch clones that branch: the working tree opens on it, not on the repository's default.
func TestSyncClonesTheBranchTheRegistryNames(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}

	base := t.TempDir()
	origin := filepath.Join(base, "origin.git")
	projects := filepath.Join(base, "projects")

	run(t, base, "git", "init", "--quiet", "--bare", "--initial-branch=main", origin)

	seed := filepath.Join(base, "seed")
	run(t, base, "git", "clone", "--quiet", origin, seed)
	write(t, filepath.Join(seed, "README.md"), "flymate\n")
	run(t, seed, "git", "add", "-A")
	run(t, seed, "git", "commit", "--quiet", "-m", "premier jet")
	run(t, seed, "git", "push", "--quiet", "origin", "main")

	run(t, seed, "git", "checkout", "--quiet", "-b", "release/2.0")
	write(t, filepath.Join(seed, "VERSION"), "2.0\n")
	run(t, seed, "git", "add", "-A")
	run(t, seed, "git", "commit", "--quiet", "-m", "la deux")
	run(t, seed, "git", "push", "--quiet", "origin", "release/2.0")

	if err := os.MkdirAll(projects, 0o755); err != nil {
		t.Fatal(err)
	}

	conf := filepath.Join(base, "projects.conf")
	write(t, conf, "two|two|"+origin+"|none|127.0.0.1|3000|-|sleep 1|-|release/2.0\n")

	reader := state.New(state.Options{
		Sys:          asMe{t: t},
		Now:          modtest.NewClock(time.Millisecond).Now,
		Registry:     modules.NewRegistry(),
		AgentVersion: "0.0.0-test",
		Paths:        registry.Paths{Conf: conf, Local: filepath.Join(base, "projects.local.conf"), Projects: projects},
		Tmux:         tmux.Options{User: "root", LogDir: filepath.Join(base, "logs")},
		Sleep:        func(time.Duration) {},
	})

	if _, err := reader.Sync("two"); err != nil {
		t.Fatal(err)
	}

	if _, err := os.Stat(filepath.Join(projects, "two", "VERSION")); err != nil {
		t.Fatalf("the branch's own file must be there: %v", err)
	}

	branches, err := reader.Branches("two")
	if err != nil {
		t.Fatal(err)
	}

	if branches.Current != "release/2.0" {
		t.Fatalf("got branch %q, want release/2.0", branches.Current)
	}
}

func initRepo(t *testing.T, dir string) {
	t.Helper()

	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}

	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}

	run(t, dir, "git", "init", "--quiet", "--initial-branch=main")
	write(t, filepath.Join(dir, "README.md"), "flymate\n")
	run(t, dir, "git", "add", "-A")
	run(t, dir, "git", "commit", "--quiet", "-m", "premier jet")
}

func readerAt(t *testing.T, base, projects string) *state.Reader {
	t.Helper()

	conf := filepath.Join(base, "projects.conf")
	write(t, conf, "web|web|-|none|127.0.0.1|3000|web|sleep 1\n")

	return state.New(state.Options{
		Sys:          asMe{t: t},
		Now:          modtest.NewClock(time.Millisecond).Now,
		Registry:     modules.NewRegistry(),
		AgentVersion: "0.0.0-test",
		Paths:        registry.Paths{Conf: conf, Local: filepath.Join(base, "projects.local.conf"), Projects: projects},
		Tmux:         tmux.Options{User: "root", LogDir: filepath.Join(base, "logs")},
		Sleep:        func(time.Duration) {},
	})
}

func TestNothingComesOutOfARepositoryThatEnclosesTheProjectsRoot(t *testing.T) {
	base := t.TempDir()
	projects := filepath.Join(base, "projects")

	initRepo(t, base)
	if err := os.MkdirAll(filepath.Join(projects, "web"), 0o755); err != nil {
		t.Fatal(err)
	}

	reader := readerAt(t, base, projects)

	status, err := reader.GitStatus("web")
	if err != nil {
		t.Fatal(err)
	}

	if status.Repo || status.Root != "" {
		t.Fatalf("the repository is %s, above the projects root: nothing may name it (%+v)", base, status)
	}

	branches, err := reader.Branches("web")
	if err != nil {
		t.Fatal(err)
	}

	if branches.Repo || branches.Root != "" {
		t.Fatalf("unexpected %+v", branches)
	}

	tree, err := reader.WorkingTree("web")
	if err != nil {
		t.Fatal(err)
	}

	if tree.Repo || tree.Root != "" {
		t.Fatalf("unexpected %+v", tree)
	}

	if _, err := reader.Checkout("web", "main"); err == nil {
		t.Fatal("a branch of a repository we cannot name must not be switched to")
	}
}

func TestTheRootSurvivesAProjectsRootReachedByASymlink(t *testing.T) {
	base := t.TempDir()
	projects := filepath.Join(base, "projects")

	initRepo(t, filepath.Join(base, "srv", "web"))
	if err := os.Symlink(filepath.Join(base, "srv"), projects); err != nil {
		t.Fatal(err)
	}

	status, err := readerAt(t, base, projects).GitStatus("web")
	if err != nil {
		t.Fatal(err)
	}

	// git answers with the physical path, which the symlink makes different from the declared one: the root stays the name the project is known by.
	if !status.Repo || status.Root != filepath.Join(projects, "web") {
		t.Fatalf("got root %q, want %q", status.Root, filepath.Join(projects, "web"))
	}

	if status.Current != "main" {
		t.Fatalf("unexpected head %+v", status)
	}
}

func TestARepositoryAboveTheProjectIsNamedInsideTheProjectsRoot(t *testing.T) {
	base := t.TempDir()
	projects := filepath.Join(base, "projects")

	initRepo(t, filepath.Join(base, "srv"))
	if err := os.MkdirAll(filepath.Join(base, "srv", "web"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(base, "srv"), projects); err != nil {
		t.Fatal(err)
	}

	status, err := readerAt(t, base, projects).GitStatus("web")
	if err != nil {
		t.Fatal(err)
	}

	if !status.Repo || status.Root != projects {
		t.Fatalf("the repository is the projects root itself, reached by a symlink: got %+v", status)
	}
}
