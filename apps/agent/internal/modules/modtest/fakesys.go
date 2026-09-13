package modtest

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"path/filepath"
	"slices"
	"sort"
	"strconv"
	"strings"
	"syscall"
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
	Refusals   map[string]string
	Failures   map[string]string
	Once       map[string]string
	Users      map[string]string
	Groups     map[string][]string
	Tools      map[string]string
	Sessions   map[string]bool
	Windows    map[string]int
	Binds      map[string]int
	Listen     map[int]bool
	Uptimes    map[int]int
	Firewall   Firewall
	Tailnet    bool
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
		Refusals:   map[string]string{},
		Failures:   map[string]string{},
		Once:       map[string]string{},
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

// Refuse answers a command line and exits 1 all the same, as a sign-in check does when nobody is signed in.
func (f *FakeSys) Refuse(fragment, stdout string) {
	f.Refusals[fragment] = stdout
}

func (f *FakeSys) FailProgram(program, stderr string) {
	f.Failures[program] = stderr
}

// FailOnce refuses the next call of a program and answers the ones after: a reload that fails, then succeeds on the previous configuration.
func (f *FakeSys) FailOnce(program, stderr string) {
	f.Once[program] = stderr
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

	if stderr, once := f.Once[program]; once {
		delete(f.Once, program)

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

	for fragment, stdout := range f.Refusals {
		if strings.Contains(line, fragment) {
			return sys.Output{Stdout: stdout, Code: 1}, &sys.ExitError{Program: program, Code: 1}
		}
	}

	// The Claude Code binary, run from where it was downloaded, installs itself under ~/.local like the real one.
	if strings.HasPrefix(base(program), "claude-") && len(cmd.Argv) > 1 && cmd.Argv[1] == "install" {
		return f.claudeInstall(cmd.User)
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
	case "find":
		return f.find(cmd.Argv[1:])
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
	case "sha256sum":
		return f.sha256sum(cmd.Argv[1:])
	case "fallocate":
		return f.fallocate(cmd.Argv[1:])
	case "code-server":
		return f.codeServer(cmd.Argv[1:])
	case "google-chrome-stable", "chromium", "chromium-browser":
		return f.chrome(cmd.Argv[1:])
	case "tailscale":
		return f.tailscale(cmd.Argv[1:])
	}

	return sys.Output{Stdout: f.Replies[program]}, nil
}

// Stream plays the command's whole answer line by line, then ends: the fake journal has nothing more to say.
func (f *FakeSys) Stream(cmd sys.Command, emit func(string)) error {
	out, err := f.Run(cmd)
	if err != nil {
		return err
	}

	for _, line := range strings.Split(strings.TrimRight(out.Stdout, "\n"), "\n") {
		if line != "" {
			emit(line)
		}
	}

	return nil
}

func (f *FakeSys) claudeInstall(owner string) (sys.Output, error) {
	home := f.Users[owner]
	if home == "" {
		home = "/home/" + owner
	}

	path := home + "/.local/bin/claude"
	if err := f.WriteFile(path, []byte("claude"), 0o755); err != nil {
		return f.fail("claude", err.Error())
	}

	f.Owners[path] = owner + ":" + owner

	return sys.Output{Stdout: "Claude Code installed\n"}, nil
}

// Downloaded is what curl writes when no test chose a body; a digest of it is what the fake's vendors publish.
const Downloaded = "downloaded\n"

// MiseVersion is the release the fake's mise index announces.
const MiseVersion = "2026.9.4"

// Digest is the SHA-256 of a body as sha256sum prints it, for a test that publishes a checksum itself.
func Digest(body string) string {
	sum := sha256.Sum256([]byte(body))

	return hex.EncodeToString(sum[:])
}

// A download to -o leaves a file behind; without it a step that fetches a binary could never be skipped on a replay.
func (f *FakeSys) curl(args []string) (sys.Output, error) {
	for i := 0; i < len(args)-1; i++ {
		if args[i] != "-o" && args[i] != "--output" {
			continue
		}

		return sys.Output{}, f.WriteFile(args[i+1], []byte(f.downloaded()), 0o755)
	}

	if body, published := f.published(args[len(args)-1]); published {
		return sys.Output{Stdout: body}, nil
	}

	return sys.Output{Stdout: f.Replies["curl"]}, nil
}

func (f *FakeSys) downloaded() string {
	if body := f.Replies["curl"]; body != "" {
		return body
	}

	return Downloaded
}

// The fake's vendors publish honest checksums: a .sha256 sidecar, or mise's version and SHASUMS256.txt, name the digest of what curl serves, so a module that verifies a download finds the figures agree. An Answer keyed on the same URL wins, which is how a test publishes a wrong one.
func (f *FakeSys) published(url string) (string, bool) {
	name := path.Base(url)

	switch {
	case strings.HasSuffix(name, ".sha256"):
		return Digest(f.downloaded()) + "  " + strings.TrimSuffix(name, ".sha256") + "\n", true
	case strings.HasSuffix(url, "mise.jdx.dev/VERSION"):
		return MiseVersion + "\n", true
	case name == "SHASUMS256.txt":
		version := strings.TrimPrefix(path.Base(path.Dir(url)), "v")
		digest := Digest(f.downloaded())

		return digest + "  ./mise-v" + version + "-linux-x64\n" + digest + "  ./mise-v" + version + "-linux-arm64\n", true
	}

	return "", false
}

// sha256sum reads the file it is given; a mismatch is staged by publishing a wrong digest, never by lying about the file.
func (f *FakeSys) sha256sum(args []string) (sys.Output, error) {
	target := args[len(args)-1]

	content, err := f.ReadFile(target)
	if err != nil {
		return f.fail("sha256sum", "sha256sum: "+target+": No such file or directory")
	}

	return sys.Output{Stdout: Digest(string(content)) + "  " + target + "\n"}, nil
}

// fallocate leaves the file behind even when a later step fails, as the real one does on a file system that refuses it.
func (f *FakeSys) fallocate(args []string) (sys.Output, error) {
	if len(args) == 0 {
		return f.fail("fallocate", "fallocate: no filename specified")
	}

	return sys.Output{}, f.WriteFile(args[len(args)-1], nil, 0o644)
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

// Joined is what tailscale status answers once up has run: a node on a tailnet, under the login that minted its key.
const Joined = `{"BackendState":"Running","Self":{"HostName":"pupitre-srv","DNSName":"pupitre-srv.tail1234.ts.net.","UserID":1},"User":{"1":{"LoginName":"jordan@example.org"}}}`

// tailscale up joins, logout leaves, and status says which; a test that wants another answer keys one with Answer, which wins.
func (f *FakeSys) tailscale(args []string) (sys.Output, error) {
	switch next(args, -1) {
	case "up":
		f.Tailnet = true
		f.mutate("tailscale up")
	case "logout":
		f.Tailnet = false
		f.mutate("tailscale logout")
	case "status":
		if f.Tailnet {
			return sys.Output{Stdout: Joined + "\n"}, nil
		}

		return sys.Output{Stdout: "{\"BackendState\":\"NeedsLogin\"}\n"}, nil
	}

	return sys.Output{}, nil
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
		if slices.Contains(args, "InvocationID") {
			if f.Units[unit] == UnitAbsent {
				return sys.Output{Stdout: "\n"}, nil
			}

			return sys.Output{Stdout: "run-" + unit + "\n"}, nil
		}

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
	f.Dirs["/home/"+name] = true
	f.Owners["/home/"+name] = name + ":" + name
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
		rule := ruleOf(words[1:])
		if f.Firewall.has(rule) {
			return sys.Output{Stdout: "Skipping adding existing rule\n"}, nil
		}
		f.Firewall.Rules = append(f.Firewall.Rules, rule)
		f.mutate("ufw allow " + rule)
	case "delete":
		rule := ruleOf(words[2:])
		f.Firewall.remove(rule)
		f.mutate("ufw delete allow " + rule)
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

// A port rule is printed as given; an interface rule — allow in on tailscale0 — as ufw prints it, "Anywhere on tailscale0".
func ruleOf(words []string) string {
	if len(words) >= 3 && words[0] == "in" && words[1] == "on" {
		return "Anywhere on " + words[2]
	}

	return words[0]
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

// A link planted with ln is followed only when it stays under the root, as os.Root does.
func (f *FakeSys) ReadFileIn(root, rel string) ([]byte, error) {
	path, err := f.inside(root, rel)
	if err != nil {
		return nil, err
	}

	target, err := f.follow(root, path)
	if err != nil {
		return nil, err
	}

	return f.ReadFile(target)
}

func (f *FakeSys) ListIn(root, rel string) ([]sys.Node, error) {
	path, err := f.inside(root, rel)
	if err != nil {
		return nil, err
	}

	entries, err := f.ReadDir(path)
	if err != nil {
		return nil, err
	}

	nodes := make([]sys.Node, 0, len(entries))
	for _, entry := range entries {
		nodes = append(nodes, f.node(entry.Name, filepath.Join(path, entry.Name)))
	}

	return nodes, nil
}

func (f *FakeSys) StatIn(root, rel string) (sys.Node, error) {
	path, err := f.inside(root, rel)
	if err != nil {
		return sys.Node{}, err
	}

	if _, linked := f.Links[path]; !linked && !f.known(path) {
		return sys.Node{}, &fs.PathError{Op: "lstat", Path: rel, Err: fs.ErrNotExist}
	}

	node := f.node(base(path), path)
	if node.Kind != sys.NodeLink {
		return node, nil
	}

	target, err := f.follow(root, path)
	if err != nil {
		return sys.Node{}, err
	}

	if !f.known(target) {
		return sys.Node{}, &fs.PathError{Op: "stat", Path: rel, Err: fs.ErrNotExist}
	}

	node.SizeBytes = int64(len(f.Files[target]))
	node.ModifiedAt = f.when(target)
	node.Mode = f.mode(target)

	return node, nil
}

func (f *FakeSys) WriteFileIn(root, rel, owner string, data []byte) error {
	path, err := f.inside(root, rel)
	if err != nil {
		return err
	}

	if _, replaced := f.Files[path]; !replaced && owner != "" {
		f.Owners[path] = owner + ":" + owner
	}

	if err := f.WriteFile(path, data, f.mode(path)); err != nil {
		return err
	}

	f.Times[path] = f.Now

	return nil
}

func (f *FakeSys) MkdirIn(root, rel, owner string) error {
	path, err := f.inside(root, rel)
	if err != nil {
		return err
	}

	if _, taken := f.Files[path]; taken {
		return &fs.PathError{Op: "mkdir", Path: rel, Err: fs.ErrExist}
	}

	var created []string
	for dir := path; dir != "/" && dir != "." && !f.Dirs[dir]; dir = filepath.Dir(dir) {
		created = append(created, dir)
	}

	if err := f.MkdirAll(path, 0o755); err != nil {
		return err
	}

	for _, dir := range created {
		if owner != "" {
			f.Owners[dir] = owner + ":" + owner
		}
	}

	return nil
}

func (f *FakeSys) RenameIn(root, from, to string) error {
	source, err := f.inside(root, from)
	if err != nil {
		return err
	}

	target, err := f.inside(root, to)
	if err != nil {
		return err
	}

	if _, linked := f.Links[source]; !linked && !f.known(source) {
		return &fs.PathError{Op: "rename", Path: from, Err: fs.ErrNotExist}
	}

	for _, known := range f.tree(source) {
		f.rekey(known, target+strings.TrimPrefix(known, source))
	}

	f.mutate("rename " + source + " -> " + target)

	return nil
}

func (f *FakeSys) RemoveIn(root, rel string, recursive bool) error {
	path, err := f.inside(root, rel)
	if err != nil {
		return err
	}

	if !recursive && f.hasChild(path+"/") {
		return &fs.PathError{Op: "remove", Path: rel, Err: syscall.ENOTEMPTY}
	}

	for _, known := range f.tree(path) {
		f.forget(known)
	}

	f.mutate("remove " + path)

	return nil
}

// The path a root-scoped call reaches, or the refusal os.Root would give: nothing is named from outside the root it belongs to.
func (f *FakeSys) inside(root, rel string) (string, error) {
	base := strings.TrimSuffix(root, "/")
	path := filepath.Join(base, rel)

	if filepath.IsAbs(rel) || (path != base && !strings.HasPrefix(path, base+"/")) {
		return "", &fs.PathError{Op: "openat", Path: rel, Err: errEscapes}
	}

	return path, nil
}

func (f *FakeSys) follow(root, path string) (string, error) {
	target, linked := f.Links[path]
	if !linked {
		return path, nil
	}

	if !filepath.IsAbs(target) {
		target = filepath.Join(filepath.Dir(path), target)
	}

	base := strings.TrimSuffix(root, "/")
	if target != base && !strings.HasPrefix(target, base+"/") {
		return "", &fs.PathError{Op: "openat", Path: path, Err: errEscapes}
	}

	return target, nil
}

func (f *FakeSys) node(name, path string) sys.Node {
	node := sys.Node{
		Name:       name,
		Kind:       sys.NodeFile,
		SizeBytes:  int64(len(f.Files[path])),
		ModifiedAt: f.when(path),
		Mode:       f.mode(path),
	}

	if _, linked := f.Links[path]; linked {
		node.Kind = sys.NodeLink

		return node
	}

	if _, isFile := f.Files[path]; !isFile && f.known(path) {
		node.Kind = sys.NodeDir
	}

	return node
}

func (f *FakeSys) mode(path string) fs.FileMode {
	if mode, set := f.Modes[path]; set {
		return mode
	}

	if _, isFile := f.Files[path]; isFile {
		return 0o644
	}

	return 0o755
}

func (f *FakeSys) when(path string) time.Time {
	if at, dated := f.Times[path]; dated {
		return at
	}

	return f.Now
}

// An entry and everything under it, deepest first, so a folder goes after what it held.
func (f *FakeSys) tree(path string) []string {
	var found []string
	for _, known := range append(f.paths(), f.links()...) {
		if known == path || strings.HasPrefix(known, path+"/") {
			found = append(found, known)
		}
	}

	sort.Slice(found, func(a, b int) bool { return len(found[a]) > len(found[b]) })

	return found
}

func (f *FakeSys) links() []string {
	paths := make([]string, 0, len(f.Links))
	for path := range f.Links {
		paths = append(paths, path)
	}

	return paths
}

func (f *FakeSys) rekey(from, to string) {
	if content, isFile := f.Files[from]; isFile {
		f.Files[to] = content
	}
	if f.Dirs[from] {
		f.Dirs[to] = true
	}
	if target, linked := f.Links[from]; linked {
		f.Links[to] = target
	}
	if mode, set := f.Modes[from]; set {
		f.Modes[to] = mode
	}
	if at, dated := f.Times[from]; dated {
		f.Times[to] = at
	}
	if owner, owned := f.Owners[from]; owned {
		f.Owners[to] = owner
	}

	f.forget(from)
}

func (f *FakeSys) forget(path string) {
	delete(f.Files, path)
	delete(f.Dirs, path)
	delete(f.Links, path)
	delete(f.Modes, path)
	delete(f.Times, path)
	delete(f.Owners, path)
}

var errEscapes = errors.New("path escapes from parent")

func (f *FakeSys) AppendFile(path string, data []byte, owner string) error {
	if _, exists := f.Files[path]; !exists {
		f.Modes[path] = 0o644
		f.Times[path] = f.Now
		if owner != "" {
			f.Owners[path] = owner + ":" + owner
		}
	}

	f.Files[path] = append(f.Files[path], data...)
	f.mutate("append " + path)

	return nil
}

func (f *FakeSys) Stat(path string) (int64, time.Time, error) {
	content, ok := f.Files[path]
	if _, linked := f.Links[path]; !ok || linked {
		return 0, time.Time{}, &fs.PathError{Op: "stat", Path: path, Err: fs.ErrNotExist}
	}

	when := f.Times[path]
	if when.IsZero() {
		when = f.Now
	}

	return int64(len(content)), when, nil
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
	if !f.known(path) {
		return &fs.PathError{Op: "chown", Path: path, Err: fs.ErrNotExist}
	}

	f.Owners[path] = owner + ":" + group
	f.mutate("chown " + path)

	return nil
}

// A folder a seeded file lives in exists, even when no test declared it.
func (f *FakeSys) known(path string) bool {
	if exists, _ := f.Exists(path); exists {
		return true
	}

	return f.hasChild(strings.TrimSuffix(path, "/") + "/")
}

func (f *FakeSys) MkdirAll(path string, mode fs.FileMode) error {
	if f.Dirs[path] {
		return nil
	}

	for dir := path; dir != "/" && dir != "." && !f.Dirs[dir]; dir = filepath.Dir(dir) {
		f.Dirs[dir] = true
	}

	f.Modes[path] = mode
	f.mutate("mkdir " + path)

	return nil
}

// A path nobody chowned belongs to root, as everything the agent writes does.
func (f *FakeSys) Owner(path string) (string, error) {
	if !f.known(path) {
		return "", &fs.PathError{Op: "lstat", Path: path, Err: fs.ErrNotExist}
	}

	owner, _, _ := strings.Cut(f.Owners[path], ":")
	if owner == "" {
		return "root", nil
	}

	return owner, nil
}

// A process that ignores SIGTERM is the whole point of force: it must still be there when the grace period is over.
func (f *FakeSys) Signal(pid int, sig syscall.Signal) error {
	if _, running := f.Procs[pid]; !running {
		return syscall.ESRCH
	}

	if sig == 0 {
		return nil
	}

	name := signalNames[sig]
	if name == "" {
		name = strconv.Itoa(int(sig))
	}

	f.Signals = append(f.Signals, name+" "+strconv.Itoa(pid))
	f.mutate("signal " + name + " " + strconv.Itoa(pid))

	if sig == syscall.SIGTERM && f.Stubborn[pid] {
		return nil
	}

	delete(f.Procs, pid)

	return nil
}

var signalNames = map[syscall.Signal]string{
	syscall.SIGTERM: "TERM",
	syscall.SIGKILL: "KILL",
	syscall.SIGHUP:  "HUP",
	syscall.SIGINT:  "INT",
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
