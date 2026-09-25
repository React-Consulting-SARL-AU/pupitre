//go:build staging

package staging

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
)

const (
	gitProject = "fixture-git"
	gitDir     = "/home/dev/projects/" + gitProject
	gitOrigin  = "/home/dev/fixtures/" + gitProject + ".git"
)

// One commit only the origin has, one only the clone has, one tracked file changed and one untracked.
const gitFixtureScript = `set -e
rm -rf ` + gitDir + ` ` + gitOrigin + ` /home/dev/fixtures/seed
mkdir -p /home/dev/fixtures
export GIT_AUTHOR_NAME=Pupitre GIT_AUTHOR_EMAIL=test@pupitre.studio
export GIT_COMMITTER_NAME=Pupitre GIT_COMMITTER_EMAIL=test@pupitre.studio
git init --quiet --bare --initial-branch=main ` + gitOrigin + `
git clone --quiet ` + gitOrigin + ` /home/dev/fixtures/seed
cd /home/dev/fixtures/seed
mkdir -p src
printf 'export const app = 1\n' > src/app.ts
git add -A && git commit --quiet -m "premier jet" && git push --quiet origin main
git clone --quiet ` + gitOrigin + ` ` + gitDir + `
printf '0.1.0\n' > CHANGELOG.md
git add -A && git commit --quiet -m "le journal des versions" && git push --quiet origin main
cd ` + gitDir + `
printf 'export const api = 2\n' > src/api.ts
git add -A && git commit --quiet -m "une route de plus"
printf 'export const app = 42\nexport const extra = true\n' > src/app.ts
printf 'a trier\n' > notes.md
`

func writeGitFixture(t *testing.T, host string) {
	t.Helper()

	write(t, host, "/home/dev/fixtures.sh", gitFixtureScript)
	ssh(t, host, "chown", "dev:dev", "/home/dev/fixtures.sh")
	ssh(t, host, "su", "-", "dev", "-c", "'sh /home/dev/fixtures.sh'")

	t.Cleanup(func() {
		sshCommand(host, "rm", "-rf", gitDir, gitOrigin, "/home/dev/fixtures", "/home/dev/fixtures.sh").Run()
	})
}

func registerGitProject(t *testing.T, host string) {
	t.Helper()

	cleanup(t, host, gitProject)

	agent(t, host, request{Cmd: "project.add", Params: map[string]any{
		"name": gitProject, "dir": gitProject, "repo": gitOrigin,
		"processes": []map[string]any{{
			"id":     "web",
			"pkgmgr": "none",
			"host":   "127.0.0.1",
			"port":   5500,
			"routes": []map[string]any{},
			"cmd":    "sleep 3600",
		}},
	}})
}

func gitStatusOf(t *testing.T, host string) contract.ProjectGitStatus {
	t.Helper()

	return decode[contract.ProjectGitStatus](t, agent(t, host,
		request{Cmd: "project.git_status", Params: map[string]any{"name": gitProject}})[0].Result)
}

func TestGitStatusTellsBehindAheadAndDirtyApart(t *testing.T) {
	host := stagingHost(t)

	writeGitFixture(t, host)
	registerGitProject(t, host)

	status := gitStatusOf(t, host)

	if !status.Repo || status.Current != "main" || status.Upstream != "origin/main" {
		t.Fatalf("unexpected head: %+v", status)
	}

	if status.Behind != 1 || status.Ahead != 1 {
		t.Fatalf("got behind %d ahead %d, want one each", status.Behind, status.Ahead)
	}

	if !status.Dirty || status.Changed != 2 {
		t.Fatalf("one tracked change and one untracked file: %+v", status)
	}

	if status.Subject != "le journal des versions" || status.Last == 0 {
		t.Fatalf("the last commit read is the upstream one: %+v", status)
	}

	if status.Problem != "" {
		t.Fatalf("a reachable remote leaves no problem: %q", status.Problem)
	}
}

func TestGitStatusReportsAnUnreachableRemote(t *testing.T) {
	host := stagingHost(t)

	writeGitFixture(t, host)
	registerGitProject(t, host)

	ssh(t, host, "su", "-", "dev", "-c", "'git -C "+gitDir+" remote set-url origin /home/dev/fixtures/nowhere.git'")

	status := gitStatusOf(t, host)
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
	host := stagingHost(t)

	writeGitFixture(t, host)
	registerGitProject(t, host)

	want := ssh(t, host, "su", "-", "dev", "-c",
		"'git -C "+gitDir+" diff --no-color --unified=3 HEAD -- ./src/app.ts'")

	diff := decode[contract.ProjectDiff](t, agent(t, host,
		request{Cmd: "project.diff", Params: map[string]any{"name": gitProject, "path": "src/app.ts"}})[0].Result)

	if diff.Patch != want {
		t.Fatalf("the patch is git's own, uninterpreted\n got: %q\nwant: %q", diff.Patch, want)
	}
}

func TestWorkingTreeListsEveryStageAndSyncCatchesUp(t *testing.T) {
	host := stagingHost(t)

	writeGitFixture(t, host)
	registerGitProject(t, host)

	tree := decode[contract.ProjectWorkingTree](t, agent(t, host,
		request{Cmd: "project.working_tree", Params: map[string]any{"name": gitProject}})[0].Result)

	stages := map[string]contract.FileChange{}

	for _, change := range tree.Files {
		stages[change.Path] = change
	}

	if stages["src/app.ts"].Stage != contract.StageUnstaged || stages["notes.md"].Stage != contract.StageUntracked {
		t.Fatalf("unexpected working tree: %+v", tree.Files)
	}

	sync := decode[contract.ProjectSync](t, agent(t, host,
		request{Cmd: "project.sync", Params: map[string]any{"name": gitProject}})[0].Result)
	if !sync.Pulled {
		t.Fatalf("unexpected sync: %+v", sync)
	}

	if after := gitStatusOf(t, host); after.Behind != 0 {
		t.Fatalf("the pull must have caught up with the remote: %+v", after)
	}
}

func TestCheckoutRefusesToCarryUncommittedWorkAway(t *testing.T) {
	host := stagingHost(t)

	writeGitFixture(t, host)
	registerGitProject(t, host)

	refused := attempt(t, host, request{Cmd: "project.checkout", Params: map[string]any{"name": gitProject, "branch": "feat/login"}})[0]
	if refused.OK {
		t.Fatal("a dirty repository must never be switched")
	}

	ssh(t, host, "su", "-", "dev", "-c", "'cd "+gitDir+" && git checkout --quiet -- src/app.ts && rm -f notes.md'")

	switched := decode[contract.ProjectCheckout](t, agent(t, host,
		request{Cmd: "project.checkout", Params: map[string]any{"name": gitProject, "branch": "feat/login"}})[0].Result)
	if switched.Branch != "feat/login" {
		t.Fatalf("got %q", switched.Branch)
	}

	branches := decode[contract.ProjectBranches](t, agent(t, host,
		request{Cmd: "project.branches", Params: map[string]any{"name": gitProject}})[0].Result)
	if branches.Current != "feat/login" || len(branches.Local) != 2 {
		t.Fatalf("unexpected branches: %+v", branches)
	}
}
