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

	// server.port as YAML nests it, or as a properties file writes it.
	yamlServerPort       = regexp.MustCompile(`(?m)^server:\s*\n(?:[ \t]+.*\n)*?[ \t]+port:\s*['"]?(\d{2,5})`)
	propertiesServerPort = regexp.MustCompile(`(?m)^\s*server\.port\s*[=:]\s*(\d{2,5})`)
)

// Where a Spring Boot or a Grails server names its port, under its own folder.
var serverConfigs = []string{
	"grails-app/conf/application.yml",
	"src/main/resources/application.yml",
	"src/main/resources/application.properties",
}

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
	"build.gradle":        true,
	"build.gradle.kts":    true,
	"settings.gradle":     true,
	"settings.gradle.kts": true,
}

// What makes a Gradle build a server one runs: a Spring Boot or a Grails plugin in its build file. An Android app has neither.
var bootable = regexp.MustCompile(`org\.springframework\.boot|spring-boot|org\.grails|grails-`)

// The subprojects a settings file includes: include 'client', 'server' — or include(":app").
var gradleIncludes = regexp.MustCompile(`(?m)^\s*include\s*\(?\s*((?:['"][^'"]+['"]\s*,?\s*)+)\)?`)

var quoted = regexp.MustCompile(`['"]([^'"]+)['"]`)

// The folders of a repository nobody runs anything from.
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
		if path == "" {
			continue
		}

		if isServerConfig(path) || (strings.Count(path, "/") < manifestDepth && manifestNames[path[strings.LastIndex(path, "/")+1:]]) {
			wanted = append(wanted, path)
		}
	}

	return wanted
}

// A server's configuration sits deeper than a manifest, under the build itself or one of its subprojects.
func isServerConfig(path string) bool {
	for _, config := range serverConfigs {
		if path == config || strings.HasSuffix(path, "/"+config) {
			return true
		}
	}

	return false
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

// One process per folder that asks for one: the root, then each folder of the first level that carries its own manifest. A monorepo run from its root is the root alone, its workspaces being its routes; a repository that asks for nothing is one process without a command.
func (r *Reader) read(root string) contract.ProjectDetect {
	files := sources{ctx: r.ctx(), root: root}
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
		member := sources{ctx: r.ctx(), root: root + "/" + entry}
		processes = append(processes, r.folder(member, entry, entry, taken, ids)...)
	}

	if len(processes) == 0 {
		processes = append(processes, r.single(files, manifest, pkgmgr, registry.RootDir, rootID, taken, ids))
	}

	return contract.ProjectDetect{Processes: processes}
}

// The folders of the first level that carry their own manifest: a package.json, a pyproject.toml, or a Gradle wrapper of their own.
func (s sources) members() []string {
	entries, err := file.List(s.ctx, s.root)
	if err != nil {
		return nil
	}

	var members []string
	for _, entry := range entries {
		if !entry.Dir || strings.HasPrefix(entry.Name, ".") || skippedFolders[entry.Name] {
			continue
		}

		member := sources{ctx: s.ctx, root: s.root + "/" + entry.Name}
		if member.first("package.json", "pyproject.toml", "gradlew") != "" {
			members = append(members, entry.Name)
		}
	}

	return members
}

// What one folder proposes: the servers of a Gradle build with a wrapper, or the one process of anything else that declares something to run.
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

// A Gradle build runs from where its wrapper is; the build itself and each subproject its settings include are a process when their build file names Spring Boot or Grails.
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

// The port a server declares for itself, which its client is written against: 0 when its configuration names none.
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

// The id of a process, off the manifest's own name when it has one: one DNS label, like the folder's otherwise.
func idOf(manifest packageJSON, fallback string) string {
	if manifest.Name != "" {
		return manifest.Name
	}

	return fallback
}

// The .localhost name a script binds to, which a laptop resolves on its own and a server does not: declared as the host, the agent makes the machine answer to it.
func declaredHost(script string) string {
	if match := hostFlag.FindStringSubmatch(script); match != nil {
		return match[1]
	}

	return ""
}

func installCommandOf(pkgmgr string) string {
	return registry.InstallCommandOf(pkgmgr)
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

// The script the repository declares, on the port the server has free — the two travel together, and a project with neither gets no command at all. A Gradle subproject names its task.
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
