package state

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/net"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	anywhere = "/"

	cloneTimeout = 2 * time.Minute

	staleMinutes = "+60"
)

var (
	portFlag   = regexp.MustCompile(`(?:--port[= ]|-p )(\d{2,5})`)
	runsScript = regexp.MustCompile(`^(?:bun|pnpm|npm|yarn)(?: run)? ([\w:.-]+)$`)
	hostFlag   = regexp.MustCompile(`--host[= ]((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+localhost)(?:\s|$)`)
	viteServer = regexp.MustCompile(`port\s*:\s*(\d{2,5})`)
)

var startScripts = []string{"dev", "start", "serve"}

const (
	maxScriptHops = 5

	// A manifest weighs a few kilobytes; a lockfile, an asset or a bundle weighs more and says nothing a detection reads.
	manifestBlobLimit = 65536

	// A workspace member sits at most two folders down: apps/web/package.json.
	manifestDepth = 3
)

// The files a detection reads or looks for, wherever they sit within the depth: the rest of the repository is never written.
var manifestNames = map[string]bool{
	"package.json":        true,
	"turbo.json":          true,
	"pnpm-workspace.yaml": true,
	"vite.config.ts":      true,
	"vite.config.js":      true,
	"vite.config.mts":     true,
	"vite.config.mjs":     true,
	"bun.lock":            true,
	"bun.lockb":           true,
	"pnpm-lock.yaml":      true,
	"package-lock.json":   true,
	"npm-shrinkwrap.json": true,
	"yarn.lock":           true,
	"pyproject.toml":      true,
	"gradlew":             true,
}

type DetectOptions struct {
	Cache string
	Name  func() string
}

func (o DetectOptions) resolved(owner string) DetectOptions {
	if o.Cache == "" {
		o.Cache = user.Home(owner) + "/.cache/pupitre/detect"
	}
	if o.Name == nil {
		o.Name = randomName
	}

	return o
}

func randomName() string {
	buffer := make([]byte, 8)
	if _, err := rand.Read(buffer); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}

	return hex.EncodeToString(buffer)
}

// What a repository asks for, before anything of it is installed: a folder already on the server, or a shallow clone that leaves nothing behind.
func (r *Reader) Detect(repo, dir, branch string) (contract.ProjectDetect, error) {
	switch {
	case repo != "" && dir != "":
		return contract.ProjectDetect{}, bad(i18n.T("state.detect.bothSources"), i18n.T("state.detect.source.fix"))
	case dir != "":
		return r.detectDir(dir)
	case repo != "":
		return r.detectRepo(repo, branch)
	}

	return contract.ProjectDetect{}, bad(i18n.T("state.detect.noSource"), i18n.T("state.detect.source.fix"))
}

func (r *Reader) detectDir(dir string) (contract.ProjectDetect, error) {
	root := registry.Under(r.options.Paths.Resolved().Projects, dir)
	if root == "" {
		return contract.ProjectDetect{}, bad(i18n.T("state.dir.outside", dir), i18n.T("state.dir.outside.fix"))
	}

	if !file.Exists(r.ctx(), root) {
		return contract.ProjectDetect{}, bad(i18n.T("state.dir.absent", dir), i18n.T("state.dir.absent.fix"))
	}

	return r.read(root), nil
}

// The clone lands in the cache of the projects user, never in the projects root: a half-clone must not be able to pass for a project.
func (r *Reader) detectRepo(repo, branch string) (contract.ProjectDetect, error) {
	if strings.HasPrefix(repo, "-") {
		return contract.ProjectDetect{}, bad(i18n.T("state.repo.invalid", repo), i18n.T("state.repo.invalid.fix"))
	}

	if branch != "" && !registry.BranchPattern.MatchString(branch) {
		return contract.ProjectDetect{}, bad(i18n.T("registry.branch.invalid", branch), i18n.T("registry.branch.invalid.fix"))
	}

	cache := r.options.Detect
	target := cache.Cache + "/" + cache.Name()

	r.sweep(cache.Cache)
	defer r.discard(target)

	if out, err := r.clone(repo, branch, target); err != nil {
		return contract.ProjectDetect{}, protocol.NewError(contract.ErrorInternal, i18n.T("state.clone.failed", repo)).
			WithFix(cloneFix(out))
	}

	if out, err := r.materialize(target); err != nil {
		return contract.ProjectDetect{}, protocol.NewError(contract.ErrorInternal, i18n.T("state.clone.failed", repo)).
			WithFix(cloneFix(out))
	}

	return r.read(target), nil
}

// The trees and the small blobs come in one pack, the working tree stays empty: a detection reads a handful of manifests, and a repository heavy with assets or history must cost no more than an empty one. A server that knows no filter says so and sends everything, which reads the same.
func (r *Reader) clone(repo, branch, target string) (sys.Output, error) {
	argv := []string{"git", "clone", "--depth", "1", "--no-tags", "--quiet", "--filter=blob:limit=" + strconv.Itoa(manifestBlobLimit), "--no-checkout"}
	if branch != "" {
		argv = append(argv, "--branch", branch)
	}
	argv = append(argv, "--", repo, target)

	// git creates the leading folders of the target itself, so the only directory these commands need to start in is the one every machine has.
	return r.gitDetect(anywhere, argv)
}

// Only the files a detection reads are written, at the depth a workspace member sits: what the listing of the trees names, nothing fetched for the rest.
func (r *Reader) materialize(target string) (sys.Output, error) {
	listed, err := r.gitDetect(target, []string{"git", "ls-tree", "-r", "--name-only", "HEAD"})
	if err != nil {
		return listed, err
	}

	wanted := manifestsAmong(strings.Split(listed.Stdout, "\n"))
	if len(wanted) == 0 {
		return listed, nil
	}

	return r.gitDetect(target, append([]string{"git", "checkout", "--quiet", "HEAD", "--"}, wanted...))
}

func manifestsAmong(paths []string) []string {
	wanted := []string{}

	for _, path := range paths {
		path = strings.TrimSpace(path)
		if path == "" || strings.Count(path, "/") >= manifestDepth {
			continue
		}

		if manifestNames[path[strings.LastIndex(path, "/")+1:]] {
			wanted = append(wanted, path)
		}
	}

	return wanted
}

// The clone's own budget holds for what follows it: a checkout may still fetch a manifest the pack left out.
func (r *Reader) gitDetect(dir string, argv []string) (sys.Output, error) {
	owner := r.options.Tmux.Resolved().User

	return r.ctx().Sys().Run(sys.Command{
		User:    owner,
		Dir:     dir,
		Argv:    argv,
		Env:     gitEnv(owner),
		Timeout: cloneTimeout,
	})
}

func (r *Reader) discard(target string) {
	owner := r.options.Tmux.Resolved().User

	if _, err := user.RunWith(r.ctx(), owner, user.Input{Dir: anywhere}, "rm", "-rf", target); err != nil {
		r.ctx().Logf("detection: %s could not be erased: %v", target, err)
	}
}

// A clone left by an agent that died mid-detection, and only that: an hour is far longer than any clone in flight.
func (r *Reader) sweep(cache string) {
	owner := r.options.Tmux.Resolved().User

	_, _ = user.RunWith(r.ctx(), owner, user.Input{Dir: anywhere},
		"find", cache, "-mindepth", "1", "-maxdepth", "1", "-mmin", staleMinutes, "-exec", "rm", "-rf", "{}", "+")
}

func (r *Reader) read(root string) contract.ProjectDetect {
	files := sources{ctx: r.ctx(), root: root}
	manifest := files.packageJSON()
	pkgmgr := detectPkgMgr(files, manifest)

	if detected, monorepo := r.monorepo(files, manifest, pkgmgr); monorepo {
		return detected
	}

	script := manifest.startScript()
	line := manifest.resolved(script)
	port := r.freePort(declaredPort(files, line), nil)

	return contract.ProjectDetect{
		PkgMgr:   pkgmgr,
		Install:  installCommandOf(pkgmgr),
		Cmd:      startCommand(pkgmgr, script, port),
		PortHint: port,
		HostHint: declaredHost(line),
	}
}

// The .localhost name a script binds to, which a laptop resolves on its own and a server does not: declared as the host, the agent makes the machine answer to it.
func declaredHost(script string) string {
	if match := hostFlag.FindStringSubmatch(script); match != nil {
		return match[1]
	}

	return ""
}

func installCommandOf(pkgmgr string) string {
	return registry.Project{PkgMgr: pkgmgr}.InstallCommand()
}

// The port the repository asks for, if nothing declared and nothing listening holds it; the next free one otherwise.
func (r *Reader) freePort(wanted int, taken map[int]bool) int {
	declared := r.registry()
	busy := net.Listening(r.ctx())

	if wanted >= 1024 && wanted <= registry.LastPort && !declared.Ports()[wanted] && !busy[wanted] && !taken[wanted] {
		return wanted
	}

	for port := range taken {
		busy[port] = true
	}

	return declared.FreePort(wanted, busy)
}

type sources struct {
	ctx  sys.Context
	root string
}

func (s sources) exists(name string) bool {
	return file.Exists(s.ctx, s.root+"/"+name)
}

func (s sources) read(name string) string {
	raw, err := file.Read(s.ctx, s.root+"/"+name)
	if err != nil {
		return ""
	}

	return string(raw)
}

func (s sources) first(names ...string) string {
	for _, name := range names {
		if s.exists(name) {
			return name
		}
	}

	return ""
}

type packageJSON struct {
	Present    bool
	Name       string            `json:"name"`
	Manager    string            `json:"packageManager"`
	Scripts    map[string]string `json:"scripts"`
	Workspaces json.RawMessage   `json:"workspaces"`
}

func (p packageJSON) startScript() string {
	for _, script := range startScripts {
		if p.Scripts[script] != "" {
			return script
		}
	}

	return ""
}

// The line at the end of a chain of scripts that only run one another: "dev" → "dev:web" → "dev:app" says its port and its host on the last one alone.
func (p packageJSON) resolved(script string) string {
	line := p.Scripts[script]

	for range maxScriptHops {
		match := runsScript.FindStringSubmatch(strings.TrimSpace(line))
		if match == nil || p.Scripts[match[1]] == "" {
			return line
		}

		line = p.Scripts[match[1]]
	}

	return line
}

func (s sources) packageJSON() packageJSON {
	raw := s.read("package.json")
	if raw == "" {
		return packageJSON{}
	}

	manifest := packageJSON{Present: true}
	if err := json.Unmarshal([]byte(raw), &manifest); err != nil {
		return packageJSON{Present: true}
	}

	return manifest
}

// The repository's own evidence, in the order it is worth: what it declares, then what it locks, then the manager Pupitre installs by default.
func detectPkgMgr(s sources, manifest packageJSON) string {
	if manifest.Present {
		if declared := node(strings.Split(manifest.Manager, "@")[0]); declared != "" {
			return declared
		}

		switch s.first("bun.lock", "bun.lockb", "pnpm-lock.yaml", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock") {
		case "pnpm-lock.yaml":
			return "pnpm"
		case "package-lock.json", "npm-shrinkwrap.json", "yarn.lock":
			return "npm"
		}

		return "bun"
	}

	if s.first("uv.lock", "pyproject.toml") != "" {
		return "uv"
	}

	if s.first("gradlew", "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts") != "" {
		return "gradle"
	}

	return "none"
}

func node(name string) string {
	switch name {
	case "bun", "pnpm", "npm":
		return name
	case "yarn":
		return "npm"
	}

	return ""
}

func declaredPort(s sources, script string) int {
	if match := portFlag.FindStringSubmatch(script); match != nil {
		return atoi(match[1])
	}

	config := s.first("vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs")
	if config == "" {
		return 0
	}

	if match := viteServer.FindStringSubmatch(s.read(config)); match != nil {
		return atoi(match[1])
	}

	return 0
}

// The script the repository declares, on the port the server has free — the two travel together, and a project with neither gets no command at all.
func startCommand(pkgmgr, script string, port int) string {
	if port == 0 {
		return ""
	}

	listen := strconv.Itoa(port)

	switch pkgmgr {
	case "bun", "pnpm", "npm":
		if script == "" {
			return ""
		}
	}

	switch pkgmgr {
	case "bun":
		return "bun run " + script + " --port " + listen
	case "pnpm":
		return "pnpm " + script + " --port " + listen
	case "npm":
		return "npm run " + script + " -- --port " + listen
	case "uv":
		return "uv run dev --port " + listen
	case "gradle":
		return "./gradlew bootRun --args='--server.port=" + listen + "'"
	}

	return ""
}

func atoi(value string) int {
	parsed, _ := strconv.Atoi(value)

	return parsed
}
