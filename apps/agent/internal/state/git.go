package state

import (
	"context"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	// Past that size nobody reads a patch line by line, and the app would freeze rendering it.
	patchLimit = 400_000

	problemLimit = 160
	subjectLimit = 120
)

var repoPathOK = regexp.MustCompile(`^[\w.\-/ +@#%,=()\[\]{}!~^&$:;]{1,300}$`)

func (r *Reader) gitCommand(dir string, argv []string) sys.Command {
	owner := r.options.Tmux.Resolved().User

	return sys.Command{
		User: owner,
		Dir:  dir,
		Argv: append([]string{"git", "-C", dir}, argv...),
		Env:  gitEnv(owner),
	}
}

// A fetch that goes past this has a remote that is not answering, and the channel behind it is waiting.
const fetchTimeout = 30 * time.Second

func (r *Reader) fetchCommand(dir string, argv ...string) sys.Command {
	command := r.gitCommand(dir, argv)
	command.Timeout = fetchTimeout

	return command
}

// A remote that answers the handshake and then trickles holds the channel as
// surely as one that never answers: the connection and the transfer are both
// bounded, through the environment so the command line stays git's own.
func gitEnv(owner string) []string {
	return []string{
		"HOME=" + user.Home(owner),
		"LC_ALL=C",
		// A repository whose remote asks for a password would hang for ever behind a protocol call.
		"GIT_TERMINAL_PROMPT=0",
		"GIT_SSH_COMMAND=ssh -o BatchMode=yes -o ConnectTimeout=10",
		"GIT_OPTIONAL_LOCKS=0",
		"GIT_CONFIG_COUNT=2",
		"GIT_CONFIG_KEY_0=http.lowSpeedLimit",
		"GIT_CONFIG_VALUE_0=1000",
		"GIT_CONFIG_KEY_1=http.lowSpeedTime",
		"GIT_CONFIG_VALUE_1=30",
	}
}

// Read-only, and unlogged: a patch of four hundred kilobytes has nothing to do in /var/log/pupitre.log.
func (r *Reader) git(dir string, argv ...string) (string, error) {
	out, err := r.ctx().Sys().Run(r.gitCommand(dir, argv))

	return strings.TrimRight(out.Stdout, "\n"), err
}

func (r *Reader) gitRaw(dir string, argv ...string) (sys.Output, error) {
	return r.ctx().Sys().Run(r.gitCommand(dir, argv))
}

func (r *Reader) gitWrite(dir string, argv ...string) (sys.Output, error) {
	return sys.Exec(r.ctx(), r.gitCommand(dir, argv))
}

func (r *Reader) repo(name string) (registry.Project, string, error) {
	project, err := r.project(name)
	if err != nil {
		return registry.Project{}, "", err
	}

	return project, project.RootPath(r.options.Paths.Resolved().Projects), nil
}

// The declared folder, then what git says of it: several projects often share one repository, and only git knows where its root really is.
func (r *Reader) top(name string) (registry.Project, string, error) {
	project, root, err := r.repo(name)
	if err != nil {
		return project, "", err
	}

	physical, cdup, err := r.toplevel(root)
	if err != nil || physical == "" {
		return project, "", nil
	}

	if cdup == "" {
		return project, root, nil
	}

	top := registry.Under(r.options.Paths.Resolved().Projects, project.Dir+"/"+cdup)
	if top == "" {
		return project, "", nil
	}

	// git names a folder by its physical path, the registry by its declared one: the two are never compared, git itself says whether the name we kept leads to the repository it named.
	if confirmed, _, err := r.toplevel(top); err != nil || confirmed != physical {
		return project, "", nil
	}

	return project, top, nil
}

// The root of the working tree and the climb that leads there from dir, in one call: the first is git's own path, the second is what lets us name that root without leaving the projects root.
func (r *Reader) toplevel(dir string) (string, string, error) {
	out, err := r.git(dir, "rev-parse", "--show-toplevel", "--show-cdup")
	if err != nil {
		return "", "", err
	}

	top, cdup, _ := strings.Cut(out, "\n")

	return strings.TrimSpace(top), strings.TrimSpace(cdup), nil
}

func (r *Reader) Branches(name string) (contract.ProjectBranches, error) {
	branches := contract.ProjectBranches{Local: []string{}, Remote: []string{}}

	_, top, err := r.top(name)
	if err != nil || top == "" {
		return branches, err
	}

	branches.Repo = true
	branches.Root = top
	branches.Current, _ = r.git(top, "rev-parse", "--abbrev-ref", "HEAD")
	branches.Dirty = r.dirty(top)
	branches.Local = r.refs(top, "refs/heads", "")
	branches.Remote = r.refs(top, "refs/remotes/origin", "origin/")

	return branches, nil
}

// refs/remotes/origin/HEAD shortens to "origin", which is not a branch.
func (r *Reader) refs(top, namespace, prefix string) []string {
	out, err := r.git(top, "for-each-ref", "--format=%(refname:short)", namespace)
	if err != nil {
		return []string{}
	}

	names := []string{}
	for _, line := range strings.Split(out, "\n") {
		name := strings.TrimPrefix(strings.TrimSpace(line), prefix)
		if name == "" || name == "origin" || name == "HEAD" {
			continue
		}

		names = append(names, name)
	}

	return names
}

func (r *Reader) Checkout(name, branch string) (string, error) {
	if !registry.BranchPattern.MatchString(branch) {
		return "", bad(i18n.T("state.branch.invalid", branch), i18n.T("state.branch.invalid.fix"))
	}

	_, top, err := r.top(name)
	if err != nil {
		return "", err
	}

	if top == "" {
		return "", notARepo(name)
	}

	// git would refuse on its own, and say it less clearly: a switch never carries uncommitted work away.
	if r.dirty(top) {
		return "", bad(i18n.T("state.tree.dirty", name), i18n.T("state.tree.dirty.fix"))
	}

	sys.Exec(r.ctx(), r.fetchCommand(top, "fetch", "--quiet", "origin"))

	// A branch known nowhere is created out of HEAD: the app's branch form names one on purpose, after checking the lists.
	argv := []string{"checkout", "--quiet", branch}
	switch {
	case r.hasRef(top, "refs/heads/"+branch):
	case r.hasRef(top, "refs/remotes/origin/"+branch):
		argv = []string{"checkout", "--quiet", "-b", branch, "--track", "origin/" + branch}
	default:
		argv = []string{"checkout", "--quiet", "-b", branch}
	}

	if _, err := r.gitWrite(top, argv...); err != nil {
		return "", protocol.NewError(contract.ErrorInternal, i18n.T("state.checkout.failed", name, branch)).
			WithFix(i18n.T("state.git.read.fix", top))
	}

	current, _ := r.git(top, "rev-parse", "--abbrev-ref", "HEAD")

	return current, nil
}

func (r *Reader) GitStatus(name string) (contract.ProjectGitStatus, error) {
	status := contract.ProjectGitStatus{}

	_, top, err := r.top(name)
	if err != nil || top == "" {
		return status, err
	}

	status.Repo = true
	status.Root = top
	status.Problem = r.fetch(top)
	status.Current, _ = r.git(top, "rev-parse", "--abbrev-ref", "HEAD")
	status.Upstream, _ = r.git(top, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")

	if status.Upstream != "" {
		status.Behind = r.count(top, "HEAD.."+status.Upstream)
		status.Ahead = r.count(top, status.Upstream+"..HEAD")
		status.Last = number(r.line(top, "log", "-1", "--format=%ct", status.Upstream))
		status.Subject = cut(r.line(top, "log", "-1", "--format=%s", status.Upstream), subjectLimit)
	}

	status.Dirty = r.dirty(top)
	// Untracked files count as changes for the badge but not for dirty: they never stand in the way of a fast-forward.
	status.Changed = len(r.porcelain(top, "--untracked-files=all"))

	return status, nil
}

func (r *Reader) fetch(top string) string {
	out, err := sys.Exec(r.ctx(), r.fetchCommand(top, "fetch", "--quiet", "--prune"))
	if err == nil {
		return ""
	}

	problem := strings.TrimSpace(strings.ReplaceAll(out.Stderr, "\n", " "))
	if problem == "" {
		problem = i18n.T("state.remote.unreachable")
	}

	return cut(problem, problemLimit)
}

func (r *Reader) WorkingTree(name string) (contract.ProjectWorkingTree, error) {
	tree := contract.ProjectWorkingTree{Files: []contract.FileChange{}}

	_, top, err := r.top(name)
	if err != nil || top == "" {
		return tree, err
	}

	tree.Repo = true
	tree.Root = top
	tree.Branch, _ = r.git(top, "rev-parse", "--abbrev-ref", "HEAD")
	tree.Upstream, _ = r.git(top, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")

	if tree.Upstream != "" {
		tree.Ahead = r.count(top, tree.Upstream+"..HEAD")
		tree.Behind = r.count(top, "HEAD.."+tree.Upstream)
	}

	files := map[string]*contract.FileChange{}
	for _, line := range r.porcelain(top, "--untracked-files=all") {
		change := parseStatusLine(line)
		if change.Path != "" {
			files[change.Path] = &change
		}
	}

	r.countLines(top, files)

	tree.Files = ordered(files)

	return tree, nil
}

// git status quotes a path with unusual characters; the counts come back under the unquoted name.
func parseStatusLine(line string) contract.FileChange {
	if len(line) < 4 {
		return contract.FileChange{}
	}

	code := line[:2]
	target := line[3:]
	change := contract.FileChange{Code: code, Stage: stageOf(code)}

	if from, to, renamed := strings.Cut(target, " -> "); renamed {
		change.Path = unquote(to)
		change.From = unquote(from)

		return change
	}

	change.Path = unquote(target)

	return change
}

// The first letter is the index, the second the working tree. A file can be both; it shows as staged, since that is what a commit would take.
func stageOf(code string) contract.FileStage {
	switch {
	case code == "??":
		return contract.StageUntracked
	case code[0] != ' ' && code[0] != '?':
		return contract.StageStaged
	}

	return contract.StageUnstaged
}

func (r *Reader) countLines(top string, files map[string]*contract.FileChange) {
	for _, numstat := range []([]string){
		{"diff", "--numstat"},
		{"diff", "--cached", "--numstat"},
	} {
		out, err := r.git(top, numstat...)
		if err != nil {
			continue
		}

		for _, line := range strings.Split(out, "\n") {
			applyNumstat(files, line)
		}
	}

	// An untracked file has no HEAD version to compare against; --no-index against /dev/null gives it the same numbers as the others.
	for path, change := range files {
		if change.Stage != contract.StageUntracked {
			continue
		}

		out, _ := r.git(top, "diff", "--numstat", "--no-index", "--", "/dev/null", "./"+path)
		added, _, counted := strings.Cut(out, "\t")
		switch {
		case !counted:
		case added == "-":
			change.Binary = true
		default:
			change.Added = number(added)
		}
	}
}

func applyNumstat(files map[string]*contract.FileChange, line string) {
	columns := strings.SplitN(strings.TrimSpace(line), "\t", 3)
	if len(columns) < 3 {
		return
	}

	change, listed := files[unquote(columns[2])]
	if !listed {
		return
	}

	if columns[0] == "-" {
		change.Binary = true
		change.Added, change.Removed = 0, 0

		return
	}

	if change.Binary {
		return
	}

	change.Added += number(columns[0])
	change.Removed += number(columns[1])
}

// Staged first, then unstaged, then untracked, alphabetical inside each: the order you would read them in, and stable between two refreshes.
func ordered(files map[string]*contract.FileChange) []contract.FileChange {
	rank := map[contract.FileStage]int{contract.StageStaged: 0, contract.StageUnstaged: 1, contract.StageUntracked: 2}

	changes := make([]contract.FileChange, 0, len(files))
	for _, change := range files {
		changes = append(changes, *change)
	}

	sort.Slice(changes, func(i, j int) bool {
		if rank[changes[i].Stage] != rank[changes[j].Stage] {
			return rank[changes[i].Stage] < rank[changes[j].Stage]
		}

		return changes[i].Path < changes[j].Path
	})

	return changes
}

func (r *Reader) Diff(name, path string) (contract.ProjectDiff, error) {
	diff := contract.ProjectDiff{Path: path}

	if !validRepoPath(path) {
		diff.Problem = i18n.T("state.diff.path.refused")

		return diff, nil
	}

	_, top, err := r.top(name)
	if err != nil {
		return diff, err
	}

	if top == "" {
		diff.Problem = i18n.T("state.repo.root.missing")

		return diff, nil
	}

	argv := []string{"diff", "--no-color", "--unified=3", "HEAD", "--", "./" + path}
	if _, err := r.git(top, "ls-files", "--error-unmatch", "--", path); err != nil {
		// git diff --no-index exits 1 when the files differ, which is the normal case here: only the output says anything.
		argv = []string{"diff", "--no-color", "--no-index", "--", "/dev/null", "./" + path}
	}

	out, _ := r.gitRaw(top, argv...)
	patch := out.Stdout

	if binaryPatch(patch) {
		diff.Binary = true

		return diff, nil
	}

	if len(patch) > patchLimit {
		diff.Patch = patch[:patchLimit]
		diff.Problem = i18n.T("state.diff.truncated")

		return diff, nil
	}

	diff.Patch = patch

	return diff, nil
}

func (r *Reader) Pull(name string) (contract.ProjectPull, error) {
	var pulled contract.ProjectPull

	err := r.withInstallLock(func() error {
		var lockErr error
		pulled, lockErr = r.pullOf(name)

		return lockErr
	})

	return pulled, err
}

func (r *Reader) pullOf(name string) (contract.ProjectPull, error) {
	project, root, err := r.repo(name)
	if err != nil {
		return contract.ProjectPull{}, err
	}

	pulled, err := r.pull(project, root)
	if err != nil {
		return contract.ProjectPull{}, err
	}

	current, err := r.one(name)
	if err != nil {
		return contract.ProjectPull{}, err
	}

	return contract.ProjectPull{Pulled: pulled, State: current.State}, nil
}

// Sync is the pull then the install, one command: what the install prints
// travels on emit, and the whole of it ends with the channel that asked.
func (r *Reader) Sync(channel context.Context, name string, emit func(string)) (contract.ProjectSync, error) {
	var synced contract.ProjectSync

	err := r.withInstallLock(func() error {
		pulled, pullErr := r.pullOf(name)
		if pullErr != nil {
			return pullErr
		}

		installed, installErr := r.install(channel, name, "", emit)
		if installErr != nil {
			return installErr
		}

		current, stateErr := r.one(name)
		if stateErr != nil {
			return stateErr
		}

		synced = contract.ProjectSync{Pulled: pulled.Pulled, Installed: len(installed) > 0, State: current.State}

		return nil
	})

	return synced, err
}

func (r *Reader) pull(project registry.Project, root string) (bool, error) {
	ctx := r.ctx()

	if exists, _ := ctx.Sys().Exists(root + "/.git"); !exists {
		if project.Repo == "" || project.Repo == "-" {
			return false, nil
		}

		owner := r.options.Tmux.User
		if _, err := file.EnsureOwned(ctx, root, owner, owner, 0o755); err != nil {
			return false, err
		}

		projects := r.options.Paths.Resolved().Projects

		argv := []string{"clone", "--recurse-submodules"}
		if project.Branch != "" {
			argv = append(argv, "--branch", project.Branch)
		}
		argv = append(argv, "--", project.Repo, root)

		if out, err := r.gitWrite(projects, argv...); err != nil {
			return false, protocol.NewError(contract.ErrorInternal, i18n.T("state.project.clone.failed", project.Name, project.Repo)).
				WithFix(cloneFix(out))
		}

		return true, r.pinRuntimes(project)
	}

	if held, other := r.otherRepository(project, root); other {
		return false, protocol.NewError(contract.ErrorBadRequest, i18n.T("state.project.repo.other", project.Name, held)).
			WithFix(i18n.T("state.project.repo.other.fix", root, project.Repo))
	}

	if out, err := r.gitWrite(root, "pull", "--rebase", "--autostash"); err != nil {
		return false, protocol.NewError(contract.ErrorInternal, i18n.T("state.pull.failed", project.Name, root)).
			WithFix(pullFix(out, root))
	}

	return true, nil
}

// A folder kept from an earlier project may hold a clone of something else: what its origin names is read before anything is pulled into it. A row without a repository, or a folder without an origin, has nothing to compare.
func (r *Reader) otherRepository(project registry.Project, root string) (string, bool) {
	if project.Repo == "" || project.Repo == "-" {
		return "", false
	}

	held, err := r.git(root, "remote", "get-url", "origin")
	if err != nil || strings.TrimSpace(held) == "" {
		return "", false
	}

	held = strings.TrimSpace(held)

	return held, !SameRepository(held, project.Repo)
}

var repositoryScheme = regexp.MustCompile(`^(?:[a-z][a-z0-9+.-]*://)?(?:[^@/]+@)?`)

// SameRepository says whether two addresses name one repository: the scheme, the account, the case of the host, a trailing slash and a .git suffix are how the same one is written twice.
func SameRepository(a, b string) bool {
	return repositoryKey(a) == repositoryKey(b)
}

func repositoryKey(address string) string {
	address = strings.TrimSpace(address)
	address = repositoryScheme.ReplaceAllString(address, "")
	address = strings.Replace(address, ":", "/", 1)
	address = strings.TrimSuffix(strings.TrimSuffix(address, "/"), ".git")

	host, path, split := strings.Cut(address, "/")
	if !split {
		return strings.ToLower(host)
	}

	return strings.ToLower(host) + "/" + path
}

// The last thing git said is why the clone failed; the SSH hint only stands when git said nothing at all.
func cloneFix(out sys.Output) string {
	if said := lastSaid(out); said != "" {
		return i18n.T("state.git.said", said)
	}

	return i18n.T("state.repo.unreadable.fix")
}

// A pull fails on a conflict, on a branch with no upstream, on a remote that went away: git's own last line tells them apart.
func pullFix(out sys.Output, root string) string {
	if said := lastSaid(out); said != "" {
		return i18n.T("state.git.said", said)
	}

	return i18n.T("state.git.read.fix", root)
}

func lastSaid(out sys.Output) string {
	lines := strings.Split(strings.TrimSpace(out.Stderr), "\n")

	return cut(strings.TrimSpace(lines[len(lines)-1]), problemLimit)
}

func (r *Reader) dirty(top string) bool {
	return len(r.porcelain(top, "--untracked-files=no")) > 0
}

func (r *Reader) porcelain(top, untracked string) []string {
	out, err := r.git(top, "status", "--porcelain=v1", untracked)
	if err != nil {
		return nil
	}

	lines := []string{}
	for _, line := range strings.Split(out, "\n") {
		if strings.TrimSpace(line) != "" {
			lines = append(lines, line)
		}
	}

	return lines
}

func (r *Reader) hasRef(top, ref string) bool {
	_, err := r.git(top, "show-ref", "--verify", "--quiet", ref)

	return err == nil
}

func (r *Reader) count(top, span string) int {
	return number(r.line(top, "rev-list", "--count", span))
}

func (r *Reader) line(top string, argv ...string) string {
	out, err := r.git(top, argv...)
	if err != nil {
		return ""
	}

	first, _, _ := strings.Cut(out, "\n")

	return strings.TrimSpace(first)
}

func binaryPatch(patch string) bool {
	for _, line := range strings.Split(patch, "\n") {
		if line == "GIT binary patch" || (strings.HasPrefix(line, "Binary files ") && strings.HasSuffix(line, " differ")) {
			return true
		}
	}

	return false
}

// The path comes back from the app, which got it from a list we produced — but it did leave the machine, so git sees it re-checked, never trusted.
func validRepoPath(path string) bool {
	return repoPathOK.MatchString(path) &&
		!strings.Contains(path, "..") &&
		!strings.HasPrefix(path, "/") &&
		!strings.Contains(path, `"`)
}

func unquote(path string) string {
	if !strings.HasPrefix(path, `"`) || !strings.HasSuffix(path, `"`) {
		return path
	}

	unquoted, err := strconv.Unquote(path)
	if err != nil {
		return strings.Trim(path, `"`)
	}

	return unquoted
}

func number(text string) int {
	parsed, err := strconv.Atoi(strings.TrimSpace(text))
	if err != nil {
		return 0
	}

	return parsed
}

func cut(text string, limit int) string {
	if len(text) <= limit {
		return text
	}

	return text[:limit]
}

func notARepo(name string) error {
	return protocol.NewError(contract.ErrorProjectNotFound, i18n.T("state.project.notInGit", name)).
		WithFix(i18n.T("state.project.sync.fix", name))
}

func bad(message, fix string) error {
	return protocol.NewError(contract.ErrorBadRequest, message).WithFix(fix)
}
