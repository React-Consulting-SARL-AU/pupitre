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
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	anywhere = "/"

	cloneTimeout = 2 * time.Minute

	staleMinutes = "+60"
)

var (
	portFlag   = regexp.MustCompile(`(?:--port[= ]|-p )(\d{2,5})`)
	viteServer = regexp.MustCompile(`port\s*:\s*(\d{2,5})`)
)

var startScripts = []string{"dev", "start", "serve"}

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
func (r *Reader) Detect(repo, dir string) (contract.ProjectDetect, error) {
	switch {
	case repo != "" && dir != "":
		return contract.ProjectDetect{}, bad("repo et dir ensemble : la détection lit une source, pas deux",
			"Donne le dépôt à cloner, ou le dossier déjà présent sur le serveur.")
	case dir != "":
		return r.detectDir(dir)
	case repo != "":
		return r.detectRepo(repo)
	}

	return contract.ProjectDetect{}, bad("ni repo ni dir", "Donne le dépôt à cloner, ou le dossier déjà présent sur le serveur.")
}

func (r *Reader) detectDir(dir string) (contract.ProjectDetect, error) {
	root := registry.Under(r.options.Paths.Resolved().Projects, dir)
	if root == "" {
		return contract.ProjectDetect{}, bad("dossier hors de la racine des projets : "+dir,
			"Donne un chemin relatif à la racine des projets, sans « .. ».")
	}

	if !file.Exists(r.ctx(), root) {
		return contract.ProjectDetect{}, bad("dossier absent : "+dir,
			"Vérifie le chemin avec completions, ou donne le dépôt à cloner.")
	}

	return r.read(root), nil
}

// The clone lands in the cache of the projects user, never in the projects root: a half-clone must not be able to pass for a project.
func (r *Reader) detectRepo(repo string) (contract.ProjectDetect, error) {
	if strings.HasPrefix(repo, "-") {
		return contract.ProjectDetect{}, bad("dépôt invalide : "+repo, "Donne une adresse de dépôt, pas une option de git.")
	}

	cache := r.options.Detect
	target := cache.Cache + "/" + cache.Name()

	r.sweep(cache.Cache)
	defer r.discard(target)

	if _, err := r.clone(repo, target); err != nil {
		return contract.ProjectDetect{}, protocol.NewError(contract.ErrorInternal, "le clonage de "+repo+" a échoué").
			WithFix("Vérifie que la machine a le droit de lire ce dépôt : ssh -T git@github.com.")
	}

	return r.read(target), nil
}

func (r *Reader) clone(repo, target string) (sys.Output, error) {
	owner := r.options.Tmux.Resolved().User

	return r.ctx().Sys().Run(sys.Command{
		User: owner,
		// git creates the leading folders of the target itself, so the only directory these commands need to start in is the one every machine has.
		Dir:     anywhere,
		Argv:    []string{"git", "clone", "--depth", "1", "--no-tags", "--quiet", "--", repo, target},
		Env:     gitEnv(owner),
		Timeout: cloneTimeout,
	})
}

func (r *Reader) discard(target string) {
	owner := r.options.Tmux.Resolved().User

	if _, err := user.RunWith(r.ctx(), owner, user.Input{Dir: anywhere}, "rm", "-rf", target); err != nil {
		r.ctx().Logf("détection : %s n'a pas pu être effacé : %v", target, err)
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
	script := manifest.startScript()
	port := r.freePort(declaredPort(files, manifest.Scripts[script]))

	return contract.ProjectDetect{
		PkgMgr:   pkgmgr,
		Install:  registry.Project{PkgMgr: pkgmgr}.InstallCommand(),
		Cmd:      startCommand(pkgmgr, script, port),
		PortHint: port,
	}
}

func (r *Reader) freePort(wanted int) int {
	declared := r.registry()

	if wanted >= 1024 && wanted <= registry.LastPort && !declared.Ports()[wanted] {
		return wanted
	}

	return declared.FreePort(wanted, nil)
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
	Present bool
	Manager string            `json:"packageManager"`
	Scripts map[string]string `json:"scripts"`
}

func (p packageJSON) startScript() string {
	for _, script := range startScripts {
		if p.Scripts[script] != "" {
			return script
		}
	}

	return ""
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
