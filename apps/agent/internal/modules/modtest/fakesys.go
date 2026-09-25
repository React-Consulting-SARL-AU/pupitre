package modtest

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"maps"
	"path"
	"path/filepath"
	"slices"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/apt"
)

type UnitState string

const (
	UnitAbsent   UnitState = ""
	UnitInactive UnitState = "inactive"
	UnitActive   UnitState = "active"
	UnitFailed   UnitState = "failed"
)

type FakeSys struct {
	Files    map[string][]byte
	Modes    map[string]fs.FileMode
	Owners   map[string]string
	Dirs     map[string]bool
	Packages map[string]string
	Upgrades map[string]string
	Units    map[string]UnitState
	Restarts map[string]int
	Replies  map[string]string
	Answers  map[string]string
	Refusals map[string]string
	Failures map[string]string
	// Keyed by a command-line fragment, where Failures is keyed by program.
	LineFailures map[string]string
	Once         map[string]string
	Users        map[string]string
	Groups       map[string][]string
	Tools        map[string]string
	Versions     map[string][]string
	Sessions     map[string]bool
	Windows      map[string]int
	// Extra windows opened under one name, by pid: tmux keeps each and refuses the name as ambiguous.
	Twins    map[string][]int
	Provides map[string]string
	// A second pane the user split off, which list-panes prints after the window's own.
	Split map[string]bool
	// Windows not listed here move at the fake's clock.
	Activity   map[string]time.Time
	Dead       map[string]int
	Binds      map[string]int
	Listen     map[int]bool
	Uptimes    map[int]int
	Firewall   Firewall
	Observe    func(cmd sys.Command)
	Tailnet    bool
	Prefs      TailscalePrefs
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
	// Streamed input each command read, keyed by its command line.
	Fed map[string][]byte
	// Source URL of each file curl wrote, keyed by path.
	Fetched map[string]string
	// Keys a URL serves instead of the ones apt pins for it: how a test serves a forged key.
	Signers map[string][]string
}

// Units as ps prints them: RSS in kilobytes, Etimes in seconds.
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
		Files:        map[string][]byte{},
		Modes:        map[string]fs.FileMode{},
		Owners:       map[string]string{},
		Dirs:         map[string]bool{},
		Packages:     map[string]string{},
		Upgrades:     map[string]string{},
		Units:        map[string]UnitState{},
		Restarts:     map[string]int{},
		Replies:      map[string]string{},
		Answers:      map[string]string{},
		Refusals:     map[string]string{},
		Failures:     map[string]string{},
		LineFailures: map[string]string{},
		Once:         map[string]string{},
		Users:        map[string]string{"root": "/root"},
		Groups:       map[string][]string{},
		Tools:        map[string]string{},
		Versions:     map[string][]string{},
		Sessions:     map[string]bool{},
		Windows:      map[string]int{},
		Twins:        map[string][]int{},
		Provides:     map[string]string{},
		Split:        map[string]bool{},
		Activity:     map[string]time.Time{},
		Dead:         map[string]int{},
		Binds:        map[string]int{},
		Listen:       map[int]bool{},
		Uptimes:      map[int]int{},
		Procs:        map[int]Proc{},
		Stubborn:     map[int]bool{},
		Links:        map[string]string{},
		Archives:     map[string][]string{},
		Extensions:   map[string]string{},
		Times:        map[string]time.Time{},
		Now:          Epoch,
		Fed:          map[string][]byte{},
		Fetched:      map[string]string{},
		Signers:      map[string][]string{},
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

// An answer keyed by a command-line fragment wins over the reply keyed by the program.
func (f *FakeSys) Answer(fragment, stdout string) {
	f.Answers[fragment] = stdout
}

// Prints the output and still exits 1, as a sign-in check does when nobody is signed in.
func (f *FakeSys) Refuse(fragment, stdout string) {
	f.Refusals[fragment] = stdout
}

func (f *FakeSys) FailProgram(program, stderr string) {
	f.Failures[program] = stderr
}

func (f *FakeSys) FailLine(fragment, stderr string) {
	f.LineFailures[fragment] = stderr
}

// Only the next call fails, like a reload that fails then succeeds on the previous configuration.
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
	if cmd.Input != nil {
		fed, _ := io.ReadAll(cmd.Input)
		f.Fed[strings.Join(cmd.Argv, " ")] = fed
	}

	out, err := f.run(cmd)
	if cmd.Output != nil && out.Stdout != "" {
		if _, written := io.WriteString(cmd.Output, out.Stdout); written != nil {
			return sys.Output{}, written
		}

		out.Stdout = ""
	}

	return out, err
}

func (f *FakeSys) FedTo(fragment string) []byte {
	for line, fed := range f.Fed {
		if strings.Contains(line, fragment) {
			return fed
		}
	}

	return nil
}

func (f *FakeSys) run(cmd sys.Command) (sys.Output, error) {
	f.Calls = append(f.Calls, cmd)

	if f.Observe != nil {
		f.Observe(cmd)
	}

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

	for fragment, stderr := range f.LineFailures {
		if strings.Contains(line, fragment) {
			return f.fail(program, stderr)
		}
	}

	// A whole-argv reply wins: some programs answer per argument, like df on two paths.
	if reply, keyed := f.Replies[line]; keyed {
		return sys.Output{Stdout: reply}, nil
	}

	// The longest fragment wins: several may match one line, and map iteration order is random.
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

	// The downloaded Claude Code binary installs itself under ~/.local like the real one.
	if strings.HasPrefix(base(program), "claude-") && len(cmd.Argv) > 1 && cmd.Argv[1] == "install" {
		return f.claudeInstall(cmd.User)
	}

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
		return f.mise(cmd, cmd.Argv[1:])
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
		return f.tar(cmd)
	case "gunzip":
		return f.gunzip(cmd.Argv[1:])
	case "gzip":
		return f.gzip(cmd)
	case "sysctl":
		return f.sysctl(cmd.Argv[1:])
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
	case "sshd":
		return f.sshd(cmd.Argv[1:])
	case "pg_dump", "mysqldump", "mongodump":
		return f.dump(cmd.Argv[1:])
	}

	return sys.Output{Stdout: f.Replies[program]}, nil
}

// Like the real one, a dump program writes its archive to the path it was given, or prints it when given none.
func (f *FakeSys) dump(args []string) (sys.Output, error) {
	for _, arg := range args {
		for _, flag := range []string{"--file=", "--result-file=", "--archive="} {
			if path, found := strings.CutPrefix(arg, flag); found {
				f.Files[path] = []byte("dump")
				f.mutate("write " + path)

				return sys.Output{}, nil
			}
		}
	}

	return sys.Output{Stdout: "dump"}, nil
}

// Like sshd -T: the first setting wins except Port and ListenAddress, which add up; no Include skips sshd_config.d.
func (f *FakeSys) sshd(args []string) (sys.Output, error) {
	if !slices.Contains(args, "-T") {
		return sys.Output{}, nil
	}

	var sources []string

	main, present := f.Files["/etc/ssh/sshd_config"]
	if !present || strings.Contains(string(main), "Include") {
		for path := range f.Files {
			if strings.HasPrefix(path, "/etc/ssh/sshd_config.d/") {
				sources = append(sources, path)
			}
		}

		sort.Strings(sources)
	}

	if present {
		sources = append(sources, "/etc/ssh/sshd_config")
	}

	effective := map[string][]string{}

	for _, source := range sources {
		for _, line := range strings.Split(string(f.Files[source]), "\n") {
			key, value, found := strings.Cut(strings.TrimSpace(line), " ")
			if key = strings.ToLower(key); !found || key == "include" {
				continue
			}

			if key == "port" || key == "listenaddress" {
				effective[key] = append(effective[key], strings.Fields(value)...)

				continue
			}

			if _, set := effective[key]; !set {
				effective[key] = strings.Fields(value)
			}
		}
	}

	for key, value := range map[string]string{"permitrootlogin": "prohibit-password", "passwordauthentication": "yes", "port": "22"} {
		if _, set := effective[key]; !set {
			effective[key] = []string{value}
		}
	}

	var out strings.Builder
	for _, key := range slices.Sorted(maps.Keys(effective)) {
		for _, value := range effective[key] {
			fmt.Fprintf(&out, "%s %s\n", key, sshdRenders(key, value))
		}
	}

	return sys.Output{Stdout: out.String()}, nil
}

// A real sshd -T prints prohibit-password under its older name.
func sshdRenders(key, value string) string {
	if key == "permitrootlogin" && value == "prohibit-password" {
		return "without-password"
	}

	return value
}

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

// What curl writes when no test chose a body; the fake's vendors publish its digest.
const Downloaded = "downloaded\n"

const MiseVersion = "2026.9.4"

func Digest(body string) string {
	sum := sha256.Sum256([]byte(body))

	return hex.EncodeToString(sum[:])
}

// A download to -o leaves a file behind, or a fetch step could never be skipped on a replay.
func (f *FakeSys) curl(args []string) (sys.Output, error) {
	for i := 0; i < len(args)-1; i++ {
		if args[i] != "-o" && args[i] != "--output" {
			continue
		}

		f.Fetched[args[i+1]] = args[len(args)-1]

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

// Checksums are honest by default; an Answer keyed on the same URL wins, which is how a test publishes a wrong one.
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

// A mismatch is staged by publishing a wrong digest, never by lying about the file.
func (f *FakeSys) sha256sum(args []string) (sys.Output, error) {
	target := args[len(args)-1]

	content, err := f.ReadFile(target)
	if err != nil {
		return f.fail("sha256sum", "sha256sum: "+target+": No such file or directory")
	}

	return sys.Output{Stdout: Digest(string(content)) + "  " + target + "\n"}, nil
}

// The file stays even when a later step fails, as with the real one on a file system that refuses it.
func (f *FakeSys) fallocate(args []string) (sys.Output, error) {
	if len(args) == 0 {
		return f.fail("fallocate", "fallocate: no filename specified")
	}

	return sys.Output{}, f.WriteFile(args[len(args)-1], nil, 0o644)
}

// Leaves the folder and Archives entries behind, or an unpack step could never be skipped on a replay.
func (f *FakeSys) tar(cmd sys.Command) (sys.Output, error) {
	args := cmd.Argv[1:]

	var archive, dest string

	for index, arg := range args {
		switch {
		case arg == "-C" || arg == "--directory":
			dest = next(args, index)
		case arg == "-f" || arg == "--file" || (strings.HasPrefix(arg, "-") && !strings.HasPrefix(arg, "--") && strings.HasSuffix(arg, "f")):
			archive = next(args, index)
		}
	}

	if archive == "-" {
		archive = cmd.StdinPath
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

		if cmd.User == "" || cmd.User == "root" {
			continue
		}

		for made := dest + "/" + entry; made != dest && strings.HasPrefix(made, dest+"/"); made = path.Dir(made) {
			f.Owners[made] = cmd.User + ":" + cmd.User
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

// Keeps the extensions it was given, so a second install of the same list has nothing left to do.
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

// A symlink holds its target, which readlink reads back and which lets a replay skip the linking step.
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

	if !symbolic(args) {
		content, err := f.ReadFile(words[0])
		if err != nil {
			return f.fail("ln", "ln: failed to access '"+words[0]+"': No such file or directory")
		}

		f.Files[words[1]] = content
		f.mutate("ln " + words[1] + " = " + words[0])

		return sys.Output{}, nil
	}

	f.Links[words[1]] = words[0]
	f.mutate("ln " + words[1] + " -> " + words[0])

	return sys.Output{}, nil
}

func symbolic(args []string) bool {
	for _, arg := range args {
		if strings.HasPrefix(arg, "-") && !strings.HasPrefix(arg, "--") && strings.Contains(arg, "s") {
			return true
		}
	}

	return slices.Contains(args, "--symbolic")
}

// Like gzip -d: the archive goes unless --keep, and --stdout prints what standard input holds.
func (f *FakeSys) gzip(cmd sys.Command) (sys.Output, error) {
	args := cmd.Argv[1:]
	path := args[len(args)-1]

	if !slices.Contains(args, "--decompress") && !slices.Contains(args, "-d") {
		return f.fail("gzip", "gzip: compression is not played by the fake")
	}

	if slices.Contains(args, "--stdout") || slices.Contains(args, "-c") {
		content, err := f.stdin(cmd)
		if err != nil {
			return sys.Output{}, err
		}

		return sys.Output{Stdout: string(content)}, nil
	}

	content, err := f.ReadFile(path)
	if err != nil {
		return f.fail("gzip", "gzip: "+path+": No such file or directory")
	}

	if err := f.WriteFile(strings.TrimSuffix(path, ".gz"), content, 0o644); err != nil {
		return f.fail("gzip", err.Error())
	}

	if slices.Contains(args, "--keep") || slices.Contains(args, "-k") {
		return sys.Output{}, nil
	}

	return sys.Output{}, f.Remove(path)
}

// Refused when a link stands on the path, as root refuses a link another account planted.
func (f *FakeSys) stdin(cmd sys.Command) ([]byte, error) {
	for at := cmd.StdinPath; at != "/" && at != "."; at = filepath.Dir(at) {
		if _, linked := f.Links[at]; linked {
			return nil, &fs.PathError{Op: "open", Path: cmd.StdinPath, Err: syscall.ELOOP}
		}
	}

	return f.ReadFile(cmd.StdinPath)
}

// The fake keeps the running kernel's settings under /proc/sys.
func (f *FakeSys) sysctl(args []string) (sys.Output, error) {
	if !slices.Contains(args, "-p") {
		return sys.Output{}, nil
	}

	content, err := f.ReadFile(args[len(args)-1])
	if err != nil {
		return f.fail("sysctl", "sysctl: cannot open \""+args[len(args)-1]+"\": No such file or directory")
	}

	for _, line := range strings.Split(string(content), "\n") {
		key, value, found := strings.Cut(line, "=")
		key = strings.TrimSpace(key)
		if !found || key == "" || strings.HasPrefix(key, "#") {
			continue
		}

		f.Files["/proc/sys/"+strings.ReplaceAll(key, ".", "/")] = []byte(strings.TrimSpace(value) + "\n")
	}

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

// The keyring file --dearmor writes is what makes the repository step skippable once there.
func (f *FakeSys) gpg(args []string) (sys.Output, error) {
	if slices.Contains(args, "--show-keys") {
		return f.showKeys(args[len(args)-1])
	}

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

// Served by a URL apt pins no key for.
const UnknownSigner = "0000000000000000000000000000000000000000"

// Each key comes with a subkey whose fingerprint is not the key's.
func (f *FakeSys) showKeys(path string) (sys.Output, error) {
	if _, err := f.ReadFile(path); err != nil {
		return f.fail("gpg", "gpg: can't open '"+path+"'")
	}

	url := f.Fetched[path]

	signers, served := f.Signers[url]
	if !served {
		signers = apt.Pins[url]
	}

	if len(signers) == 0 {
		signers = []string{UnknownSigner}
	}

	var out strings.Builder

	for _, fingerprint := range signers {
		fmt.Fprintf(&out, "pub:-:4096:1:%s:1487788586:::-:::scESA::::::23::0:\n", fingerprint[24:])
		fmt.Fprintf(&out, "fpr:::::::::%s:\n", fingerprint)
		out.WriteString("uid:-::::1487792064::0::Vendor Packaging <packaging@example.org>::::::::::0:\n")
		out.WriteString("sub:-:4096:1:7EA0A9C3F273FCD8:1487788586::::::s::::::23:\n")
		fmt.Fprintf(&out, "fpr:::::::::%s7EA0A9C3F273FCD8:\n", strings.Repeat("A", 24))
	}

	return sys.Output{Stdout: out.String()}, nil
}

// What tailscale status answers once up has run.
const Joined = `{"BackendState":"Running","Self":{"HostName":"pupitre-srv","DNSName":"pupitre-srv.tail1234.ts.net.","UserID":1},"User":{"1":{"LoginName":"jordan@example.org"}}}`

// An Answer wins over this; up and set keep the hostname and SSH flags that debug prefs reads back.
func (f *FakeSys) tailscale(args []string) (sys.Output, error) {
	switch next(args, -1) {
	case "up":
		f.Tailnet = true
		f.keepPrefs(args)
		f.mutate("tailscale up")
	case "set":
		f.keepPrefs(args)
		f.mutate("tailscale set " + strings.Join(args[1:], " "))
	case "logout":
		f.Tailnet = false
		f.mutate("tailscale logout")
	case "status":
		if f.Tailnet {
			return sys.Output{Stdout: Joined + "\n"}, nil
		}

		return sys.Output{Stdout: "{\"BackendState\":\"NeedsLogin\"}\n"}, nil
	case "debug":
		if next(args, 0) == "prefs" {
			return sys.Output{Stdout: fmt.Sprintf("{\"Hostname\":%q,\"RunSSH\":%t}\n", f.Prefs.Hostname, f.Prefs.SSH)}, nil
		}
	}

	return sys.Output{}, nil
}

type TailscalePrefs struct {
	Hostname string
	SSH      bool
}

func (f *FakeSys) keepPrefs(args []string) {
	for _, arg := range args[1:] {
		switch {
		case strings.HasPrefix(arg, "--hostname="):
			f.Prefs.Hostname = strings.TrimPrefix(arg, "--hostname=")
		case arg == "--ssh" || arg == "--ssh=true":
			f.Prefs.SSH = true
		case arg == "--ssh=false":
			f.Prefs.SSH = false
		}
	}
}

// Writes the requested image, so a capture is a file the gallery can then list.
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

const (
	miseInstalls = "/home/dev/.local/share/mise/installs/"

	// The real mise reads this back to know every tool's default.
	MiseGlobalConfig = "/home/dev/.config/mise/config.toml"
)

// Tools holds each tool's default, Versions everything installed beside it; mise ls prints the union.
func (f *FakeSys) mise(cmd sys.Command, args []string) (sys.Output, error) {
	if len(args) > 0 && (args[0] == "x" || args[0] == "exec") {
		return f.miseExec(cmd, args[1:])
	}

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
			if previous, held := f.Tools[tool]; held {
				f.addVersion(tool, f.resolved(tool, previous))
			}

			f.Tools[tool] = version
			f.addVersion(tool, f.resolved(tool, version))
			f.mutate("mise use " + tool + "@" + version)
		}

		f.writeMiseGlobal()
	case "install":
		for _, spec := range words[1:] {
			tool, version := parseTool(spec)
			f.addVersion(tool, f.resolved(tool, version))
			f.mutate("mise install " + tool + "@" + version)
		}
	case "uninstall":
		for _, spec := range words[1:] {
			tool, version := parseTool(spec)
			f.dropVersion(tool, version)
			f.mutate("mise uninstall " + spec)
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
	case "trust":
		f.mutate("mise trust " + strings.Join(words[1:], " "))
	case "ls", "list":
		return sys.Output{Stdout: f.toolList()}, nil
	default:
		return f.fail("mise", "error: unrecognized subcommand '"+words[0]+"'")
	}

	return sys.Output{}, nil
}

// The program after -- runs as the same user; its output and failures are its own.
func (f *FakeSys) miseExec(cmd sys.Command, args []string) (sys.Output, error) {
	at := slices.Index(args, "--")
	if at < 0 || at == len(args)-1 {
		return f.fail("mise", "error: a command is required after --")
	}

	inner := cmd
	inner.Argv = args[at+1:]

	return f.Run(inner)
}

// A fuzzy request resolves to the release a test announced under Upgrades ("mise:node@22"), else stays as asked.
func (f *FakeSys) resolved(tool, version string) string {
	if next, ok := f.Upgrades["mise:"+tool+"@"+version]; ok {
		return next
	}

	return version
}

func (f *FakeSys) addVersion(tool, version string) {
	for _, held := range f.Versions[tool] {
		if held == version {
			return
		}
	}

	f.Versions[tool] = append(f.Versions[tool], version)
}

// The default goes only with the last version, as a request in the real configuration outlives its release.
func (f *FakeSys) dropVersion(tool, version string) {
	if version == "latest" {
		delete(f.Tools, tool)
		delete(f.Versions, tool)

		return
	}

	kept := f.Versions[tool][:0]
	for _, held := range f.Versions[tool] {
		if held != version {
			kept = append(kept, held)
		}
	}

	if len(kept) > 0 {
		f.Versions[tool] = kept

		return
	}

	delete(f.Versions, tool)

	if f.Tools[tool] == version {
		delete(f.Tools, tool)
	}
}

func (f *FakeSys) writeMiseGlobal() {
	names := make([]string, 0, len(f.Tools))
	for name := range f.Tools {
		names = append(names, name)
	}

	sort.Strings(names)

	var out strings.Builder

	out.WriteString("[tools]\n")

	for _, name := range names {
		fmt.Fprintf(&out, "%q = %q\n", name, f.Tools[name])
	}

	f.Dirs["/home/dev/.config/mise"] = true
	f.Files[MiseGlobalConfig] = []byte(out.String())
}

func (f *FakeSys) toolList() string {
	held := map[string][]string{}
	for name, version := range f.Tools {
		held[name] = append(held[name], version)
	}

	for name, versions := range f.Versions {
		for _, version := range versions {
			if !slices.Contains(held[name], version) {
				held[name] = append(held[name], version)
			}
		}
	}

	names := make([]string, 0, len(held))
	for name := range held {
		names = append(names, name)
	}

	sort.Strings(names)

	var out strings.Builder

	for _, name := range names {
		versions := held[name]
		sort.Strings(versions)

		for _, version := range versions {
			fmt.Fprintf(&out, "%s  %s  ~/.config/mise/config.toml\n", name, version)
		}
	}

	return out.String()
}

// The last "@" splits only when it opens a version, not a scoped npm package as in npm:@openai/codex@latest.
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

			// A virtual name lands its provider, as apt does: Ubuntu's chromium is a snap stub named chromium-browser.
			if provider, virtual := f.Provides[pkg]; virtual {
				pkg = provider
			}

			// apt-get install takes an installed package to its candidate.
			if _, present := f.Packages[pkg]; !present {
				f.Packages[pkg] = "1.0"
			} else if next, ok := f.Upgrades[pkg]; ok {
				f.Packages[pkg] = next
				delete(f.Upgrades, pkg)
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

// Only usermod -aG <group> <user>: the form the modules use, and the one that makes joining a group replayable.
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

	// An existing home keeps its owner, as useradd warns.
	if !f.known("/home/" + name) {
		f.Owners["/home/"+name] = name + ":" + name
	}

	f.Dirs["/home/"+name] = true
	f.mutate("useradd " + name)

	return sys.Output{}, nil
}

type Firewall struct {
	Active   bool
	Incoming string
	Outgoing string
	Rules    []string
	Comments map[string]string
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
	case "show":
		return sys.Output{Stdout: f.Firewall.added()}, nil
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

		if comment := commentOf(words); comment != "" {
			if f.Firewall.Comments == nil {
				f.Firewall.Comments = map[string]string{}
			}

			f.Firewall.Comments[rule] = comment
		}

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

func commentOf(words []string) string {
	for i, word := range words {
		if word == "comment" && i+1 < len(words) {
			return words[i+1]
		}
	}

	return ""
}

// An interface rule (allow in on tailscale0) prints as ufw does: "Anywhere on tailscale0".
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

// Listed whether the firewall is up or not, as ufw show added does.
func (w Firewall) added() string {
	var out strings.Builder

	out.WriteString("Added user rules (see 'ufw status' for running firewall):\n")

	for _, rule := range w.Rules {
		given := rule
		if strings.HasPrefix(rule, "Anywhere on ") {
			given = "in on " + strings.TrimPrefix(rule, "Anywhere on ")
		}

		if comment := w.Comments[rule]; comment != "" {
			given += " comment '" + comment + "'"
		}

		fmt.Fprintf(&out, "ufw allow %s\n", given)
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
	if !ok && path == netTable {
		return f.netTable(), nil
	}

	if !ok {
		return nil, &fs.PathError{Op: "open", Path: path, Err: fs.ErrNotExist}
	}

	return append([]byte(nil), content...), nil
}

func (f *FakeSys) ReadTail(path string, max int64) ([]byte, error) {
	content, err := f.ReadFile(path)
	if err != nil {
		return nil, err
	}

	if from := int64(len(content)) - max; from > 0 {
		content = content[from:]
	}

	return content, nil
}

// A file shorter than offset was truncated, so it is read from its start.
func (f *FakeSys) ReadFrom(path string, offset int64) ([]byte, error) {
	content, err := f.ReadFile(path)
	if err != nil {
		return nil, err
	}

	if offset > int64(len(content)) {
		offset = 0
	}

	return content[offset:], nil
}

const netTable = "/proc/net/tcp"

func (f *FakeSys) netTable() []byte {
	ports := make([]int, 0, len(f.Listen))
	for port, listening := range f.Listen {
		if listening {
			ports = append(ports, port)
		}
	}

	sort.Ints(ports)

	var out strings.Builder

	out.WriteString("  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n")

	for at, port := range ports {
		fmt.Fprintf(&out, "%4d: 0100007F:%04X 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 %d 1 0000 100 0 0 10 0\n", at, port, 10000+at)
	}

	return []byte(out.String())
}

// A link planted with ln is followed only while it stays under the root, as os.Root does.
func (f *FakeSys) ReadFileIn(root, rel string) ([]byte, error) {
	path, err := f.inside(root, rel)
	if err != nil {
		return nil, err
	}

	target, err := f.follow(root, path)
	if err != nil {
		return nil, err
	}

	// A mode with a type bit (fs.ModeNamedPipe…) stands for a non-regular file.
	if f.Modes[target]&fs.ModeType != 0 {
		return nil, &fs.PathError{Op: "read", Path: rel, Err: sys.ErrNotRegular}
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

// Written through a link that stays under the root: the target keeps its mode and owner, the link stays a link.
func (f *FakeSys) WriteFileIn(root, rel, owner string, data []byte) error {
	path, err := f.inside(root, rel)
	if err != nil {
		return err
	}

	path, err = f.follow(root, path)
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

// Replaces whatever stood at the name, a link included; the content lands on Close.
func (f *FakeSys) CreateIn(root, rel, owner string) (io.WriteCloser, error) {
	path, err := f.inside(root, rel)
	if err != nil {
		return nil, err
	}

	if _, err := f.follow(root, filepath.Dir(path)); err != nil {
		return nil, err
	}

	f.forget(path)

	return &created{fake: f, path: path, owner: owner}, nil
}

type created struct {
	fake    *FakeSys
	path    string
	owner   string
	content []byte
}

func (c *created) Write(p []byte) (int, error) {
	c.content = append(c.content, p...)

	return len(p), nil
}

func (c *created) Close() error {
	c.fake.Files[c.path] = c.content
	c.fake.Modes[c.path] = 0o600
	c.fake.Times[c.path] = c.fake.Now

	if c.owner != "" {
		c.fake.Owners[c.path] = c.owner + ":" + c.owner
	}

	c.fake.mutate("write " + c.path)

	return nil
}

// Refuses as os.Root would: nothing is named from outside the root it belongs to.
func (f *FakeSys) inside(root, rel string) (string, error) {
	base := filepath.Clean(root)
	path := filepath.Join(base, rel)

	if filepath.IsAbs(rel) || (path != base && !strings.HasPrefix(path, strings.TrimSuffix(base, "/")+"/")) {
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

	if node.Kind == sys.NodeFile && f.Modes[path]&fs.ModeType != 0 {
		node.Kind = sys.NodeSpecial
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

// Deepest first, so a folder goes after what it held.
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

// The fake is a flat map of paths: a folder's entries are the names under its prefix, one level deep.
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

// KeepMode leaves an existing file at its own mode and gives a new one the default.
func (f *FakeSys) WriteFile(path string, data []byte, mode fs.FileMode) error {
	if mode == sys.KeepMode {
		mode = sys.DefaultMode
		if _, existed := f.Files[path]; existed {
			mode = f.mode(path)
		}
	}

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

// Unchowned paths belong to root, as everything the agent writes does.
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

// A Stubborn process ignores SIGTERM, which is what force exists for.
func (f *FakeSys) Signal(pid int, owner string, sig syscall.Signal) error {
	proc, running := f.Procs[pid]
	if !running {
		return syscall.ESRCH
	}

	if owner != "" && proc.User != owner {
		return syscall.EPERM
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
