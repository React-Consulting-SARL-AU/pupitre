package modtest

import (
	"fmt"
	"io/fs"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/sys"
)

type UnitState string

const (
	UnitAbsent   UnitState = ""
	UnitInactive UnitState = "inactive"
	UnitActive   UnitState = "active"
	UnitFailed   UnitState = "failed"
)

type FakeSys struct {
	Files      map[string][]byte
	Modes      map[string]fs.FileMode
	Owners     map[string]string
	Dirs       map[string]bool
	Packages   map[string]string
	Upgrades   map[string]string
	Units      map[string]UnitState
	Restarts   map[string]int
	Replies    map[string]string
	Answers    map[string]string
	Failures   map[string]string
	Users      map[string]string
	Groups     map[string][]string
	Tools      map[string]string
	Sessions   map[string]bool
	Windows    map[string]int
	Binds      map[string]int
	Listen     map[int]bool
	Uptimes    map[int]int
	Firewall   Firewall
	Procs      map[int]Proc
	Stubborn   map[int]bool
	Links      map[string]string
	Archives   map[string][]string
	Extensions map[string]string
	Times      map[string]time.Time
	Signals    []string
	Now        time.Time
	Calls      []sys.Command
	Mutations  []string
	Updates    int
}

// A row of ps, in the units ps prints: RSS in kilobytes, Etimes in seconds.
type Proc struct {
	PID    int
	PPID   int
	RSS    int
	CPU    float64
	Etimes int
	User   string
	Comm   string
	Args   string
}

func NewFakeSys() *FakeSys {
	return &FakeSys{
		Files:      map[string][]byte{},
		Modes:      map[string]fs.FileMode{},
		Owners:     map[string]string{},
		Dirs:       map[string]bool{},
		Packages:   map[string]string{},
		Upgrades:   map[string]string{},
		Units:      map[string]UnitState{},
		Restarts:   map[string]int{},
		Replies:    map[string]string{},
		Answers:    map[string]string{},
		Failures:   map[string]string{},
		Users:      map[string]string{"root": "/root"},
		Groups:     map[string][]string{},
		Tools:      map[string]string{},
		Sessions:   map[string]bool{},
		Windows:    map[string]int{},
		Binds:      map[string]int{},
		Listen:     map[int]bool{},
		Uptimes:    map[int]int{},
		Procs:      map[int]Proc{},
		Stubborn:   map[int]bool{},
		Links:      map[string]string{},
		Archives:   map[string][]string{},
		Extensions: map[string]string{},
		Times:      map[string]time.Time{},
		Now:        Epoch,
	}
}

func (f *FakeSys) Spawn(proc Proc) {
	if proc.User == "" {
		proc.User = "dev"
	}
	if proc.Comm == "" {
		proc.Comm = base(field(proc.Args, 0))
	}

	f.Procs[proc.PID] = proc
}

func (f *FakeSys) Alive(pid int) bool {
	_, running := f.Procs[pid]

	return running
}

func (f *FakeSys) FailPackage(pkg, stderr string) {
	f.Failures["apt:"+pkg] = stderr
}

// One program, several questions: an answer keyed by a fragment of the command line wins over the reply keyed by the program.
func (f *FakeSys) Answer(fragment, stdout string) {
	f.Answers[fragment] = stdout
}

func (f *FakeSys) FailProgram(program, stderr string) {
	f.Failures[program] = stderr
}

func (f *FakeSys) EnvValue(key string) string {
	for _, line := range strings.Split(string(f.Files["/etc/pupitre/env"]), "\n") {
		if name, value, ok := strings.Cut(line, "="); ok && name == key {
			return value
		}
	}

	return ""
}

func (f *FakeSys) Commands() []string {
	lines := make([]string, 0, len(f.Calls))
	for _, call := range f.Calls {
		lines = append(lines, sys.Describe(call))
	}

	return lines
}

func (f *FakeSys) Run(cmd sys.Command) (sys.Output, error) {
	f.Calls = append(f.Calls, cmd)

	if len(cmd.Argv) == 0 {
		return sys.Output{}, fmt.Errorf("empty command")
	}

	program := cmd.Argv[0]
	if stderr, failing := f.Failures[program]; failing {
		return f.fail(program, stderr)
	}

	line := strings.Join(cmd.Argv, " ")

	// A reply keyed by the whole argv wins: some programs answer differently per argument, like df on two paths.
	if reply, keyed := f.Replies[line]; keyed {
		return sys.Output{Stdout: reply}, nil
	}

	// The longest matching fragment wins: two answers may both match one command line, and a map iterates in no order.
	best := ""
	for fragment := range f.Answers {
		if strings.Contains(line, fragment) && len(fragment) > len(best) {
			best = fragment
		}
	}
	if best != "" {
		return sys.Output{Stdout: f.Answers[best]}, nil
	}

	// A program is recognised by its name, whether the caller gave a path or relied on PATH.
	switch base(program) {
	case "dpkg-query":
		return f.dpkgQuery(cmd.Argv[1:])
	case "apt-get":
		return f.aptGet(cmd.Argv[1:])
	case "systemctl":
		return f.systemctl(cmd.Argv[1:])
	case "id":
		return f.id(cmd.Argv[1:])
	case "useradd":
		return f.useradd(cmd.Argv[1:])
	case "usermod":
		return f.usermod(cmd.Argv[1:])
	case "ufw":
		return f.ufw(cmd.Argv[1:])
	case "curl":
		return f.curl(cmd.Argv[1:])
	case "mise":
		return f.mise(cmd.Argv[1:])
	case "tmux":
		return f.tmux(cmd.Argv[1:])
	case "ss":
		return f.ss()
	case "ps":
		return f.ps(cmd.Argv[1:])
	case "tee":
		return f.tee(cmd.Argv[1:], cmd.Stdin)
	case "find":
		return f.find(cmd.Argv[1:])
	case "kill":
		return f.kill(cmd.Argv[1:])
	case "ln":
		return f.ln(cmd.Argv[1:])
	case "readlink":
		return f.readlink(cmd.Argv[1:])
	case "gpg":
		return f.gpg(cmd.Argv[1:])
	case "tar":
		return f.tar(cmd.Argv[1:])
	case "gunzip":
		return f.gunzip(cmd.Argv[1:])
	case "chmod":
		return f.chmod(cmd.Argv[1:])
	case "rm":
		return f.rm(cmd.Argv[1:])
	case "code-server":
		return f.codeServer(cmd.Argv[1:])
	case "google-chrome-stable", "chromium", "chromium-browser":
		return f.chrome(cmd.Argv[1:])
	}

	return sys.Output{Stdout: f.Replies[program]}, nil
}

// A download to -o leaves a file behind; without it a step that fetches a binary could never be skipped on a replay.
func (f *FakeSys) curl(args []string) (sys.Output, error) {
	for i := 0; i < len(args)-1; i++ {
		if args[i] != "-o" && args[i] != "--output" {
			continue
		}

		body := f.Replies["curl"]
		if body == "" {
			body = "downloaded\n"
		}

		return sys.Output{}, f.WriteFile(args[i+1], []byte(body), 0o755)
	}

	return sys.Output{Stdout: f.Replies["curl"]}, nil
}

// An extraction leaves a folder behind, and the entries seeded in Archives; without them a step that unpacks an archive could never be skipped on a replay.
func (f *FakeSys) tar(args []string) (sys.Output, error) {
	var archive, dest string
	for index, arg := range args {
		switch {
		case arg == "-C" || arg == "--directory":
			dest = next(args, index)
		case arg == "-f" || arg == "--file" || (strings.HasPrefix(arg, "-") && !strings.HasPrefix(arg, "--") && strings.HasSuffix(arg, "f")):
			archive = next(args, index)
		}
	}

	if _, err := f.ReadFile(archive); err != nil {
		return f.fail("tar", "tar: "+archive+": Cannot open: No such file or directory")
	}

	if dest == "" {
		return f.fail("tar", "tar: refusing to extract without a destination")
	}

	if err := f.MkdirAll(dest, 0o755); err != nil {
		return f.fail("tar", err.Error())
	}

	for _, entry := range f.Archives[archive] {
		if err := f.WriteFile(dest+"/"+entry, []byte("extrait de "+archive), 0o755); err != nil {
			return f.fail("tar", err.Error())
		}
	}

	return sys.Output{}, nil
}

func (f *FakeSys) gunzip(args []string) (sys.Output, error) {
	path := args[len(args)-1]

	content, err := f.ReadFile(path)
	if err != nil {
		return f.fail("gunzip", "gunzip: "+path+": No such file or directory")
	}

	if err := f.WriteFile(strings.TrimSuffix(path, ".gz"), content, 0o644); err != nil {
		return f.fail("gunzip", err.Error())
	}

	return sys.Output{}, f.Remove(path)
}

func (f *FakeSys) chmod(args []string) (sys.Output, error) {
	if len(args) < 2 {
		return f.fail("chmod", "chmod: missing operand")
	}

	mode, err := strconv.ParseUint(args[0], 8, 32)
	if err != nil {
		return f.fail("chmod", "chmod: invalid mode: '"+args[0]+"'")
	}

	for _, path := range args[1:] {
		f.Modes[path] = fs.FileMode(mode)
	}

	return sys.Output{}, nil
}

func (f *FakeSys) rm(args []string) (sys.Output, error) {
	for _, path := range args {
		if strings.HasPrefix(path, "-") {
			continue
		}

		for known := range f.Files {
			if known == path || strings.HasPrefix(known, path+"/") {
				f.Remove(known)
			}
		}

		for known := range f.Dirs {
			if known == path || strings.HasPrefix(known, path+"/") {
				delete(f.Dirs, known)
				f.mutate("remove " + known)
			}
		}

		delete(f.Links, path)
	}

	return sys.Output{}, nil
}

// The VS Code server CLI keeps the extensions it was given, so a second install of the same list has nothing left to do.
func (f *FakeSys) codeServer(args []string) (sys.Output, error) {
	for index, arg := range args {
		switch arg {
		case "--list-extensions":
			names := make([]string, 0, len(f.Extensions))
			for name := range f.Extensions {
				names = append(names, name)
			}
			sort.Strings(names)

			return sys.Output{Stdout: strings.Join(names, "\n") + "\n"}, nil
		case "--install-extension":
			name := next(args, index)
			f.Extensions[name] = "1.0.0"
			f.mutate("code --install-extension " + name)
		case "--uninstall-extension":
			name := next(args, index)
			delete(f.Extensions, name)
			f.mutate("code --uninstall-extension " + name)
		}
	}

	return sys.Output{}, nil
}

func next(args []string, index int) string {
	if index+1 < len(args) {
		return args[index+1]
	}

	return ""
}

// A symlink is a file holding the path it points at, which is what readlink reads back and what makes the linking step skippable on a replay.
func (f *FakeSys) ln(args []string) (sys.Output, error) {
	var words []string
	for _, arg := range args {
		if !strings.HasPrefix(arg, "-") {
			words = append(words, arg)
		}
	}

	if len(words) < 2 {
		return f.fail("ln", "ln: missing file operand")
	}

	f.Links[words[1]] = words[0]
	f.mutate("ln " + words[1] + " -> " + words[0])

	return sys.Output{}, nil
}

func (f *FakeSys) readlink(args []string) (sys.Output, error) {
	path := args[len(args)-1]

	target, linked := f.Links[path]
	if !linked {
		return f.fail("readlink", "")
	}

	return sys.Output{Stdout: target + "\n"}, nil
}

// --dearmor turns an armoured key into a keyring file, which is what makes the repository step skippable once it is there.
func (f *FakeSys) gpg(args []string) (sys.Output, error) {
	var out, in string
	for index, arg := range args {
		switch {
		case arg == "-o" || arg == "--output":
			if index+1 < len(args) {
				out = args[index+1]
			}
		case !strings.HasPrefix(arg, "-") && args[index-1] != "-o" && args[index-1] != "--output":
			in = arg
		}
	}

	if out == "" {
		return f.fail("gpg", "gpg: no output file")
	}

	content, err := f.ReadFile(in)
	if err != nil {
		return f.fail("gpg", "gpg: can't open '"+in+"'")
	}

	return sys.Output{}, f.WriteFile(out, content, 0o644)
}

// The headless browser writes the image it was asked for, so a capture is a file the gallery can then list.
func (f *FakeSys) chrome(args []string) (sys.Output, error) {
	for _, arg := range args {
		if target, ok := strings.CutPrefix(arg, "--screenshot="); ok {
			body := f.Replies["screenshot"]
			if body == "" {
				body = "\x89PNG\r\n"
			}

			return sys.Output{}, f.WriteFile(target, []byte(body), 0o644)
		}
	}

	return sys.Output{}, nil
}

const miseInstalls = "/home/dev/.local/share/mise/installs/"

func (f *FakeSys) mise(args []string) (sys.Output, error) {
	var words []string
	for _, arg := range args {
		if !strings.HasPrefix(arg, "-") {
			words = append(words, arg)
		}
	}

	if len(words) == 0 {
		return f.fail("mise", "error: a subcommand is required")
	}

	switch words[0] {
	case "use":
		for _, spec := range words[1:] {
			tool, version := parseTool(spec)
			f.Tools[tool] = version
			f.mutate("mise use " + tool + "@" + version)
		}
	case "uninstall":
		for _, spec := range words[1:] {
			tool, _ := parseTool(spec)
			delete(f.Tools, tool)
			f.mutate("mise uninstall " + tool)
		}
	case "upgrade":
		for _, tool := range words[1:] {
			next, upgradable := f.Upgrades["mise:"+tool]
			if !upgradable {
				continue
			}

			f.Tools[tool] = next
			delete(f.Upgrades, "mise:"+tool)
			f.mutate("mise upgrade " + tool)
		}
	case "where":
		version, installed := f.Tools[words[1]]
		if !installed {
			return f.fail("mise", "mise "+words[1]+" not installed")
		}

		return sys.Output{Stdout: miseInstalls + words[1] + "/" + version + "\n"}, nil
	case "ls", "list":
		return sys.Output{Stdout: f.toolList()}, nil
	default:
		return f.fail("mise", "error: unrecognized subcommand '"+words[0]+"'")
	}

	return sys.Output{}, nil
}

func (f *FakeSys) toolList() string {
	names := make([]string, 0, len(f.Tools))
	for name := range f.Tools {
		names = append(names, name)
	}
	sort.Strings(names)

	var out strings.Builder
	for _, name := range names {
		fmt.Fprintf(&out, "%s  %s  ~/.config/mise/config.toml\n", name, f.Tools[name])
	}

	return out.String()
}

// mise resolves node@22 to a patch release; the fake keeps the request, which a pinned major still matches.
// The separator is the last "@" that opens a version rather than a scoped npm package, as in npm:@openai/codex@latest.
func parseTool(spec string) (tool, version string) {
	at := strings.LastIndex(spec, "@")
	if at <= 0 || spec[at-1] == '/' || spec[at-1] == ':' || at == len(spec)-1 {
		return spec, "latest"
	}

	return spec[:at], spec[at+1:]
}

func (f *FakeSys) dpkgQuery(args []string) (sys.Output, error) {
	pkg := args[len(args)-1]
	version, installed := f.Packages[pkg]
	if !installed {
		return f.fail("dpkg-query", "dpkg-query: no packages found matching "+pkg)
	}

	for _, arg := range args {
		if strings.Contains(arg, "Version") {
			return sys.Output{Stdout: version + "\n"}, nil
		}
	}

	return sys.Output{Stdout: "install ok installed"}, nil
}

func (f *FakeSys) aptGet(args []string) (sys.Output, error) {
	action, packages, onlyUpgrade := parseApt(args)

	switch action {
	case "update":
		f.Updates++
		f.mutate("apt-get update")
	case "install":
		for _, pkg := range packages {
			if stderr, failing := f.Failures["apt:"+pkg]; failing {
				return f.fail("apt-get", stderr)
			}

			if onlyUpgrade {
				if next, ok := f.Upgrades[pkg]; ok {
					f.Packages[pkg] = next
					delete(f.Upgrades, pkg)
					f.mutate("apt-get upgrade " + pkg)
				}
				continue
			}

			if _, present := f.Packages[pkg]; !present {
				f.Packages[pkg] = "1.0"
			}
			f.mutate("apt-get install " + pkg)
		}
	case "remove":
		for _, pkg := range packages {
			delete(f.Packages, pkg)
			f.mutate("apt-get remove " + pkg)
		}
	default:
		return f.fail("apt-get", "E: Invalid operation "+action)
	}

	return sys.Output{}, nil
}

func parseApt(args []string) (action string, packages []string, onlyUpgrade bool) {
	for i := 0; i < len(args); i++ {
		arg := args[i]

		switch {
		case arg == "-o":
			i++
		case arg == "--only-upgrade":
			onlyUpgrade = true
		case strings.HasPrefix(arg, "-"):
		case action == "":
			action = arg
		default:
			packages = append(packages, arg)
		}
	}

	return action, packages, onlyUpgrade
}

func (f *FakeSys) systemctl(args []string) (sys.Output, error) {
	var action, unit string
	for _, arg := range args {
		switch {
		case strings.HasPrefix(arg, "-"):
		case action == "":
			action = arg
		default:
			unit = arg
		}
	}

	switch action {
	case "show":
		if f.Units[unit] == UnitAbsent {
			return sys.Output{Stdout: "not-found\n"}, nil
		}

		return sys.Output{Stdout: "loaded\n"}, nil
	case "daemon-reload", "reboot":
		f.mutate("systemctl " + action)
	case "enable", "start":
		f.Units[unit] = UnitActive
		f.mutate("systemctl " + action + " " + unit)
	case "disable", "stop":
		if f.Units[unit] != UnitAbsent {
			f.Units[unit] = UnitInactive
		}
		f.mutate("systemctl " + action + " " + unit)
	case "restart", "reload":
		if f.Units[unit] == UnitAbsent {
			return f.fail("systemctl", "Failed to "+action+" "+unit+".service: Unit "+unit+".service not found.")
		}

		f.Restarts[unit]++
		f.Units[unit] = UnitActive
		f.mutate("systemctl " + action + " " + unit)
	case "is-active":
		state := f.Units[unit]
		if state == UnitAbsent {
			state = UnitInactive
		}

		if state != UnitActive {
			return sys.Output{Stdout: string(state) + "\n", Code: 3}, &sys.ExitError{Program: "systemctl", Code: 3}
		}

		return sys.Output{Stdout: "active\n"}, nil
	default:
		return f.fail("systemctl", "Unknown command verb "+action+".")
	}

	return sys.Output{}, nil
}

func (f *FakeSys) id(args []string) (sys.Output, error) {
	name := args[len(args)-1]
	if _, ok := f.Users[name]; !ok {
		return f.fail("id", "id: '"+name+"': no such user")
	}

	return sys.Output{Stdout: strings.Join(append([]string{name}, f.Groups[name]...), " ") + "\n"}, nil
}

// usermod -aG <group> <user>: the only form the modules use, and the one that makes joining a group replayable.
func (f *FakeSys) usermod(args []string) (sys.Output, error) {
	name := args[len(args)-1]
	if _, ok := f.Users[name]; !ok {
		return f.fail("usermod", "usermod: user '"+name+"' does not exist")
	}

	for index, arg := range args {
		if arg != "-aG" && arg != "-G" {
			continue
		}

		for _, group := range strings.Split(next(args, index), ",") {
			if !slices.Contains(f.Groups[name], group) {
				f.Groups[name] = append(f.Groups[name], group)
			}
		}

		f.mutate("usermod " + name + " " + next(args, index))
	}

	return sys.Output{}, nil
}

func (f *FakeSys) useradd(args []string) (sys.Output, error) {
	name := args[len(args)-1]
	if _, exists := f.Users[name]; exists {
		return f.fail("useradd", "useradd: user '"+name+"' already exists")
	}

	f.Users[name] = "/home/" + name
	f.mutate("useradd " + name)

	return sys.Output{}, nil
}

type Firewall struct {
	Active   bool
	Incoming string
	Outgoing string
	Rules    []string
}

func (f *FakeSys) ufw(args []string) (sys.Output, error) {
	var words []string
	for _, arg := range args {
		if !strings.HasPrefix(arg, "-") {
			words = append(words, arg)
		}
	}

	if len(words) == 0 {
		return f.fail("ufw", "ERROR: not enough args")
	}

	switch words[0] {
	case "status":
		return sys.Output{Stdout: f.Firewall.status()}, nil
	case "default":
		if words[2] == "incoming" {
			f.Firewall.Incoming = words[1]
		} else {
			f.Firewall.Outgoing = words[1]
		}
		f.mutate("ufw default " + words[1] + " " + words[2])
	case "allow":
		if f.Firewall.has(words[1]) {
			return sys.Output{Stdout: "Skipping adding existing rule\n"}, nil
		}
		f.Firewall.Rules = append(f.Firewall.Rules, words[1])
		f.mutate("ufw allow " + words[1])
	case "delete":
		f.Firewall.remove(words[2])
		f.mutate("ufw delete allow " + words[2])
	case "enable":
		f.Firewall.Active = true
		f.mutate("ufw enable")
	case "disable":
		f.Firewall.Active = false
		f.mutate("ufw disable")
	default:
		return f.fail("ufw", "ERROR: Invalid syntax")
	}

	return sys.Output{}, nil
}

func (w Firewall) status() string {
	if !w.Active {
		return "Status: inactive\n"
	}

	var out strings.Builder
	fmt.Fprintf(&out, "Status: active\nLogging: on (low)\nDefault: %s (incoming), %s (outgoing), disabled (routed)\nNew profiles: skip\n\nTo                         Action      From\n--                         ------      ----\n", w.Incoming, w.Outgoing)
	for _, rule := range w.Rules {
		fmt.Fprintf(&out, "%-26s ALLOW IN    Anywhere\n", rule)
	}
	for _, rule := range w.Rules {
		fmt.Fprintf(&out, "%-26s ALLOW IN    Anywhere (v6)\n", rule+" (v6)")
	}

	return out.String()
}

func (w Firewall) has(rule string) bool {
	for _, existing := range w.Rules {
		if existing == rule {
			return true
		}
	}

	return false
}

func (w *Firewall) remove(rule string) {
	var kept []string
	for _, existing := range w.Rules {
		if existing != rule {
			kept = append(kept, existing)
		}
	}
	w.Rules = kept
}

func (f *FakeSys) ReadFile(path string) ([]byte, error) {
	content, ok := f.Files[path]
	if !ok {
		return nil, &fs.PathError{Op: "open", Path: path, Err: fs.ErrNotExist}
	}

	return append([]byte(nil), content...), nil
}

// The fake holds a flat map of paths, so a folder's entries are the names that begin with it and go no deeper.
func (f *FakeSys) ReadDir(path string) ([]sys.Entry, error) {
	prefix := strings.TrimSuffix(path, "/") + "/"
	if known, _ := f.Exists(path); !known && !f.hasChild(prefix) {
		return nil, &fs.PathError{Op: "open", Path: path, Err: fs.ErrNotExist}
	}

	seen := map[string]bool{}
	entries := []sys.Entry{}

	for _, known := range f.paths() {
		rest, inside := strings.CutPrefix(known, prefix)
		name, _, deeper := strings.Cut(rest, "/")
		if !inside || name == "" || seen[name] {
			continue
		}

		seen[name] = true
		entries = append(entries, sys.Entry{Name: name, Dir: deeper || f.Dirs[prefix+name]})
	}

	sort.Slice(entries, func(a, b int) bool { return entries[a].Name < entries[b].Name })

	return entries, nil
}

func (f *FakeSys) paths() []string {
	paths := make([]string, 0, len(f.Files)+len(f.Dirs))
	for path := range f.Files {
		paths = append(paths, path)
	}
	for path := range f.Dirs {
		paths = append(paths, path)
	}

	return paths
}

func (f *FakeSys) hasChild(prefix string) bool {
	for _, path := range f.paths() {
		if strings.HasPrefix(path, prefix) {
			return true
		}
	}

	return false
}

func (f *FakeSys) WriteFile(path string, data []byte, mode fs.FileMode) error {
	f.Files[path] = append([]byte(nil), data...)
	f.Modes[path] = mode
	if _, dated := f.Times[path]; !dated {
		f.Times[path] = f.Now
	}
	f.mutate("write " + path)

	return nil
}

func (f *FakeSys) Remove(path string) error {
	if _, ok := f.Files[path]; !ok {
		return nil
	}

	delete(f.Files, path)
	delete(f.Modes, path)
	delete(f.Times, path)
	f.mutate("remove " + path)

	return nil
}

func (f *FakeSys) Exists(path string) (bool, error) {
	if _, ok := f.Files[path]; ok {
		return true, nil
	}

	return f.Dirs[path], nil
}

func (f *FakeSys) Chown(path, owner, group string) error {
	if _, ok := f.Files[path]; !ok && !f.Dirs[path] {
		return &fs.PathError{Op: "chown", Path: path, Err: fs.ErrNotExist}
	}

	f.Owners[path] = owner + ":" + group
	f.mutate("chown " + path)

	return nil
}

func (f *FakeSys) MkdirAll(path string, mode fs.FileMode) error {
	if f.Dirs[path] {
		return nil
	}

	f.Dirs[path] = true
	f.Modes[path] = mode
	f.mutate("mkdir " + path)

	return nil
}

func (f *FakeSys) mutate(description string) {
	f.Mutations = append(f.Mutations, description)
}

func (f *FakeSys) fail(program, stderr string) (sys.Output, error) {
	code := 1
	if program == "apt-get" {
		code = 100
	}

	return sys.Output{Stderr: stderr, Code: code}, &sys.ExitError{Program: program, Code: code, Stderr: stderr}
}
