package modtest

import (
	"fmt"
	"io/fs"
	"sort"
	"strings"

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
	Files     map[string][]byte
	Modes     map[string]fs.FileMode
	Owners    map[string]string
	Dirs      map[string]bool
	Packages  map[string]string
	Upgrades  map[string]string
	Units     map[string]UnitState
	Restarts  map[string]int
	Replies   map[string]string
	Failures  map[string]string
	Users     map[string]string
	Tools     map[string]string
	Firewall  Firewall
	Calls     []sys.Command
	Mutations []string
	Updates   int
}

func NewFakeSys() *FakeSys {
	return &FakeSys{
		Files:    map[string][]byte{},
		Modes:    map[string]fs.FileMode{},
		Owners:   map[string]string{},
		Dirs:     map[string]bool{},
		Packages: map[string]string{},
		Upgrades: map[string]string{},
		Units:    map[string]UnitState{},
		Restarts: map[string]int{},
		Replies:  map[string]string{},
		Failures: map[string]string{},
		Users:    map[string]string{"root": "/root"},
		Tools:    map[string]string{},
	}
}

func (f *FakeSys) FailPackage(pkg, stderr string) {
	f.Failures["apt:"+pkg] = stderr
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
		return sys.Output{}, fmt.Errorf("commande vide")
	}

	program := cmd.Argv[0]
	if stderr, failing := f.Failures[program]; failing {
		return f.fail(program, stderr)
	}

	// A reply keyed by the whole argv wins: some programs answer differently per argument, like df on two paths.
	if reply, keyed := f.Replies[strings.Join(cmd.Argv, " ")]; keyed {
		return sys.Output{Stdout: reply}, nil
	}

	switch program {
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
	case "ufw":
		return f.ufw(cmd.Argv[1:])
	case "curl":
		return f.curl(cmd.Argv[1:])
	case "mise":
		return f.mise(cmd.Argv[1:])
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
func parseTool(spec string) (tool, version string) {
	tool, version, found := strings.Cut(spec, "@")
	if !found || version == "" {
		version = "latest"
	}

	return tool, version
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
	case "daemon-reload":
		f.mutate("systemctl daemon-reload")
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

	return sys.Output{Stdout: name + "\n"}, nil
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

func (f *FakeSys) WriteFile(path string, data []byte, mode fs.FileMode) error {
	f.Files[path] = append([]byte(nil), data...)
	f.Modes[path] = mode
	f.mutate("write " + path)

	return nil
}

func (f *FakeSys) Remove(path string) error {
	if _, ok := f.Files[path]; !ok {
		return nil
	}

	delete(f.Files, path)
	delete(f.Modes, path)
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
