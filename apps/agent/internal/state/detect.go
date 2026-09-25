package state

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
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

	yamlServerPort       = regexp.MustCompile(`(?m)^server:\s*\n(?:[ \t]+.*\n)*?[ \t]+port:\s*['"]?(\d{2,5})`)
	propertiesServerPort = regexp.MustCompile(`(?m)^\s*server\.port\s*[=:]\s*(\d{2,5})`)
)

var serverConfigs = []string{
	"grails-app/conf/application.yml",
	"src/main/resources/application.yml",
	"src/main/resources/application.properties",
}

var startScripts = []string{"dev", "start", "serve"}

const (
	maxScriptHops = 5

	// Manifests weigh a few KB; bigger blobs (lockfiles, assets, bundles) say nothing a detection reads.
	manifestBlobLimit = 65536

	// A workspace member sits at most two folders down: apps/web/package.json.
	manifestDepth = 3
)

// Only these are checked out from a detection clone; the rest of the repository is never written.
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
	"build.gradle":        true,
	"build.gradle.kts":    true,
	"settings.gradle":     true,
	"settings.gradle.kts": true,
}

// Spring Boot or Grails makes a Gradle build a server one runs; an Android app has neither.
var bootable = regexp.MustCompile(`org\.springframework\.boot|spring-boot|org\.grails|grails-`)

// Matches include 'client', 'server' as well as include(":app").
var gradleIncludes = regexp.MustCompile(`(?m)^\s*include\s*\(?\s*((?:['"][^'"]+['"]\s*,?\s*)+)\)?`)

var quoted = regexp.MustCompile(`['"]([^'"]+)['"]`)

var skippedFolders = map[string]bool{"node_modules": true, "build": true, "dist": true, "target": true, "vendor": true}

const rootID = "app"

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

// Reads a folder already on the server, or a shallow clone that leaves nothing behind.
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
	projects := r.options.Paths.Resolved().Projects

	root := registry.Under(projects, dir)
	if root == "" {
		return contract.ProjectDetect{}, bad(i18n.T("state.dir.outside", dir), i18n.T("state.dir.outside.fix"))
	}

	files := r.sourcesIn(projects, below(projects, root))
	if !files.exists(".") {
		return contract.ProjectDetect{}, bad(i18n.T("state.dir.absent", dir), i18n.T("state.dir.absent.fix"))
	}

	return r.read(files), nil
}

// The clone lands in the projects user's cache, never the projects root: a half-clone must not pass for a project.
func (r *Reader) detectRepo(repo, branch string) (contract.ProjectDetect, error) {
	if strings.HasPrefix(repo, "-") {
		return contract.ProjectDetect{}, bad(i18n.T("state.repo.invalid", repo), i18n.T("state.repo.invalid.fix"))
	}

	if branch != "" && !registry.BranchPattern.MatchString(branch) {
		return contract.ProjectDetect{}, bad(i18n.T("registry.branch.invalid", branch), i18n.T("registry.branch.invalid.fix"))
	}

	cache := r.options.Detect
	name := cache.Name()
	target := cache.Cache + "/" + name

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

	return r.read(r.sourcesIn(cache.Cache, name)), nil
}

// Reads stay inside root, never through a link leaving it: dev writes the repository, root reads it.
func (r *Reader) sourcesIn(root, dir string) sources {
	return sources{ctx: r.ctx(), root: root, dir: dir}
}

func below(root, full string) string {
	return strings.TrimPrefix(strings.TrimPrefix(full, path.Clean(root)), "/")
}

// Trees and small blobs in one pack, no working tree: an asset-heavy repository costs no more than an empty one.
func (r *Reader) clone(repo, branch, target string) (sys.Output, error) {
	argv := []string{"git", "clone", "--depth", "1", "--no-tags", "--quiet", "--filter=blob:limit=" + strconv.Itoa(manifestBlobLimit), "--no-checkout"}
	if branch != "" {
		argv = append(argv, "--branch", branch)
	}

	argv = append(argv, "--", repo, target)

	// git creates the target's leading folders itself, so the commands only need a directory every machine has.
	return r.gitDetect(anywhere, argv)
}

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
		if path == "" {
			continue
		}

		if isServerConfig(path) || (strings.Count(path, "/") < manifestDepth && manifestNames[path[strings.LastIndex(path, "/")+1:]]) {
			wanted = append(wanted, path)
		}
	}

	return wanted
}

// A server's configuration sits deeper than manifestDepth, under the build or one of its subprojects.
func isServerConfig(path string) bool {
	for _, config := range serverConfigs {
		if path == config || strings.HasSuffix(path, "/"+config) {
			return true
		}
	}

	return false
}

// The clone's timeout also covers the checkout, which may still fetch a manifest the pack left out.
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

// Only clones left by an agent that died mid-detection: an hour far exceeds any clone in flight.
func (r *Reader) sweep(cache string) {
	owner := r.options.Tmux.Resolved().User

	_, _ = user.RunWith(r.ctx(), owner, user.Input{Dir: anywhere},
		"find", cache, "-mindepth", "1", "-maxdepth", "1", "-mmin", staleMinutes, "-exec", "rm", "-rf", "{}", "+")
}

// A monorepo run from its root is the root alone, its workspaces being its routes.
func (r *Reader) read(files sources) contract.ProjectDetect {
	taken := map[int]bool{}
	ids := map[string]bool{}

	manifest := files.packageJSON()
	pkgmgr := detectPkgMgr(files, manifest)

	if detected, monorepo := r.monorepo(files, manifest, pkgmgr, taken); monorepo {
		detected.ID = uniqueLabel(idOf(manifest, rootID), ids)

		return contract.ProjectDetect{Processes: []contract.DetectedProcess{detected}}
	}

	processes := r.folder(files, registry.RootDir, rootID, taken, ids)

	for _, entry := range files.members() {
		processes = append(processes, r.folder(files.sub(entry), entry, entry, taken, ids)...)
	}

	if len(processes) == 0 {
		processes = append(processes, r.single(files, manifest, pkgmgr, registry.RootDir, rootID, taken, ids))
	}

	return contract.ProjectDetect{Processes: processes}
}

func (s sources) members() []string {
	var members []string

	for _, name := range s.folders(".") {
		if skippedFolders[name] {
			continue
		}

		if s.sub(name).first("package.json", "pyproject.toml", "gradlew") != "" {
			members = append(members, name)
		}
	}

	return members
}

func (r *Reader) folder(files sources, dir, fallback string, taken map[int]bool, ids map[string]bool) []contract.DetectedProcess {
	manifest := files.packageJSON()
	pkgmgr := detectPkgMgr(files, manifest)

	if pkgmgr == "gradle" && files.exists("gradlew") {
		return r.gradle(files, dir, fallback, taken, ids)
	}

	if pkgmgr == "none" || (manifest.Present && manifest.startScript() == "" && pkgmgr != "uv") {
		return nil
	}

	return []contract.DetectedProcess{r.single(files, manifest, pkgmgr, dir, fallback, taken, ids)}
}

func (r *Reader) single(files sources, manifest packageJSON, pkgmgr, dir, fallback string, taken map[int]bool, ids map[string]bool) contract.DetectedProcess {
	script := manifest.startScript()
	line := manifest.resolved(script)
	port := r.freePort(declaredPort(files, line), taken)
	taken[port] = true

	return contract.DetectedProcess{
		ID:       uniqueLabel(idOf(manifest, fallback), ids),
		Dir:      dir,
		PkgMgr:   pkgmgr,
		Install:  installCommandOf(pkgmgr),
		Cmd:      startCommand(pkgmgr, script, "", port),
		PortHint: port,
		HostHint: declaredHost(line),
	}
}

func (r *Reader) gradle(files sources, dir, fallback string, taken map[int]bool, ids map[string]bool) []contract.DetectedProcess {
	var processes []contract.DetectedProcess

	if files.bootable("") {
		processes = append(processes, r.gradleProcess(files, dir, uniqueLabel(fallback, ids), "", taken))
	}

	for _, subproject := range files.subprojects() {
		if !files.bootable(subproject) {
			continue
		}

		processes = append(processes, r.gradleProcess(files, dir, uniqueLabel(subproject, ids), subproject, taken))
	}

	return processes
}

func (r *Reader) gradleProcess(files sources, dir, id, subproject string, taken map[int]bool) contract.DetectedProcess {
	port := r.freePort(files.serverPort(subproject), taken)
	taken[port] = true

	return contract.DetectedProcess{
		ID:       id,
		Dir:      dir,
		PkgMgr:   "gradle",
		Install:  installCommandOf("gradle"),
		Cmd:      startCommand("gradle", "", subproject, port),
		PortHint: port,
	}
}

func (s sources) bootable(subproject string) bool {
	prefix := ""
	if subproject != "" {
		prefix = strings.ReplaceAll(subproject, ":", "/") + "/"
	}

	build := s.first(prefix+"build.gradle", prefix+"build.gradle.kts")
	if build == "" {
		return false
	}

	return bootable.MatchString(s.read(build))
}

// The port the server declares matters: its client is written against it.
func (s sources) serverPort(subproject string) int {
	prefix := ""
	if subproject != "" {
		prefix = strings.ReplaceAll(subproject, ":", "/") + "/"
	}

	for _, config := range serverConfigs {
		text := s.read(prefix + config)
		if text == "" {
			continue
		}

		pattern := yamlServerPort
		if strings.HasSuffix(config, ".properties") {
			pattern = propertiesServerPort
		}

		if match := pattern.FindStringSubmatch(text); match != nil {
			return atoi(match[1])
		}
	}

	return 0
}

func (s sources) subprojects() []string {
	settings := s.first("settings.gradle", "settings.gradle.kts")
	if settings == "" {
		return nil
	}

	var names []string

	for _, statement := range gradleIncludes.FindAllStringSubmatch(s.read(settings), -1) {
		for _, match := range quoted.FindAllStringSubmatch(statement[1], -1) {
			names = append(names, strings.TrimPrefix(match[1], ":"))
		}
	}

	return names
}

func idOf(manifest packageJSON, fallback string) string {
	if manifest.Name != "" {
		return manifest.Name
	}

	return fallback
}

func declaredHost(script string) string {
	if match := hostFlag.FindStringSubmatch(script); match != nil {
		return match[1]
	}

	return ""
}

func installCommandOf(pkgmgr string) string {
	return registry.InstallCommandOf(pkgmgr)
}

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
	dir  string
}

func (s sources) at(name string) string {
	return path.Join(s.dir, name)
}

func (s sources) sub(name string) sources {
	return sources{ctx: s.ctx, root: s.root, dir: s.at(name)}
}

func (s sources) exists(name string) bool {
	_, err := s.ctx.Sys().StatIn(s.root, s.at(name))

	return err == nil
}

func (s sources) read(name string) string {
	raw, err := s.ctx.Sys().ReadFileIn(s.root, s.at(name))
	if err != nil {
		return ""
	}

	return string(raw)
}

// Hidden folders are left out, and a link never counts as a folder.
func (s sources) folders(name string) []string {
	nodes, err := s.ctx.Sys().ListIn(s.root, s.at(name))
	if err != nil {
		return nil
	}

	var folders []string

	for _, node := range nodes {
		if node.Kind == sys.NodeDir && !strings.HasPrefix(node.Name, ".") {
			folders = append(folders, node.Name)
		}
	}

	return folders
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

// Follows scripts that only run one another: "dev" → "dev:web" → "dev:app" names its port on the last one alone.
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

// Evidence by worth: what the repository declares, then what it locks, then the manager Pupitre installs by default.
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

// Script and port travel together: without either there is no command at all.
func startCommand(pkgmgr, script, subproject string, port int) string {
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
		task := "bootRun"
		if subproject != "" {
			task = ":" + strings.TrimPrefix(subproject, ":") + ":bootRun"
		}

		return "./gradlew " + task + " --args='--server.port=" + listen + "'"
	}

	return ""
}

func atoi(value string) int {
	parsed, _ := strconv.Atoi(value)

	return parsed
}
