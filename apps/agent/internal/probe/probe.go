package probe

import (
	"path"
	"strings"

	"pupitre.studio/agent/internal/sys"
)

const (
	DefaultProjectsDir = "/home/dev/projects"

	agentPath     = "/usr/local/bin/pupitred"
	reportPath    = "/var/lib/pupitre/report.json"
	osReleasePath = "/etc/os-release"
	passwdPath    = "/etc/passwd"
	memInfoPath   = "/proc/meminfo"
)

var dockerPaths = []string{"/usr/bin/docker", "/usr/local/bin/docker", "/var/lib/docker", "/run/docker.sock"}

var panels = []struct {
	Name string
	Dirs []string
}{
	{Name: "cPanel", Dirs: []string{"/usr/local/cpanel"}},
	{Name: "Plesk", Dirs: []string{"/usr/local/psa", "/opt/psa"}},
	{Name: "CloudPanel", Dirs: []string{"/home/clp", "/etc/cloudpanel"}},
	{Name: "aaPanel", Dirs: []string{"/www/server/panel"}},
}

type Options struct {
	Sys         sys.Sys
	Root        string
	ProjectsDir string
	Version     string
}

func Run(options Options) Result {
	reader := prober{sys: options.Sys, root: options.Root, projects: options.ProjectsDir, current: options.Version}
	if reader.projects == "" {
		reader.projects = DefaultProjectsDir
	}

	machine := reader.machine()

	return Result{
		OS:               machine.OS,
		Version:          machine.Version,
		Arch:             machine.Arch,
		RAMMB:            machine.RAMMB,
		DiskFreeGB:       machine.DiskFreeGB,
		Sudo:             machine.Sudo,
		Ports:            machine.Ports,
		Docker:           machine.Docker,
		Panel:            optional(machine.Panel),
		AgentVersion:     optional(machine.AgentVersion),
		InstalledModules: reader.installedModules(),
		Verdict:          Decide(machine),
	}
}

type prober struct {
	sys      sys.Sys
	root     string
	projects string
	current  string
}

func (p prober) machine() Machine {
	id, version := parseOSRelease(p.read(osReleasePath))

	return Machine{
		OS:           id,
		Version:      version,
		Arch:         normalizeArch(strings.TrimSpace(p.output("uname", "-m"))),
		RAMMB:        p.ramMB(),
		DiskFreeGB:   gigabytes(p.diskFree()),
		Sudo:         p.sudo(),
		Ports:        p.ports(),
		Docker:       p.docker(),
		Panel:        p.panel(),
		AgentVersion: p.agentVersion(),
		Users:        parseUsers(p.read(passwdPath)),
		Current:      p.current,
	}
}

func (p prober) ramMB() int {
	total := parseFreeBytes(p.output("free", "-b"))
	if total == 0 {
		total = parseMemInfoBytes(p.read(memInfoPath))
	}

	return int(total / 1048576)
}

// The projects folder often lives on its own volume; the smaller of the two is the one that will run out.
func (p prober) diskFree() int64 {
	root := parseAvailBytes(p.output("df", "-P", "-B1", "/"))
	projects := parseAvailBytes(p.output("df", "-P", "-B1", p.existingDir(p.projects)))

	return smallest(root, projects)
}

func (p prober) existingDir(dir string) string {
	for dir != "" && dir != "/" && dir != "." {
		if ok, err := p.sys.Exists(dir); err == nil && ok {
			return dir
		}

		dir = path.Dir(dir)
	}

	return "/"
}

func (p prober) sudo() bool {
	if strings.TrimSpace(p.output("id", "-u")) == "0" {
		return true
	}

	if _, err := p.sys.Run(sys.Command{Argv: []string{"sudo", "-n", "true"}}); err == nil {
		return true
	}

	// Decision 0015: a secured dev runs only `pupitred serve` without a password; -l checks that rule without running it.
	if !p.exists(agentPath) {
		return false
	}

	_, err := p.sys.Run(sys.Command{Argv: []string{"sudo", "-n", "-l", p.root + agentPath, "serve"}})

	return err == nil
}

func (p prober) ports() []Port {
	if out := p.output("ss", "-ltnp"); strings.TrimSpace(out) != "" {
		return parseSS(out)
	}

	return parseNetstat(p.output("netstat", "-ltnp"))
}

func (p prober) docker() bool {
	for _, candidate := range dockerPaths {
		if p.exists(candidate) {
			return true
		}
	}

	return false
}

func (p prober) panel() string {
	for _, candidate := range panels {
		for _, dir := range candidate.Dirs {
			if p.exists(dir) {
				return candidate.Name
			}
		}
	}

	return ""
}

func (p prober) agentVersion() string {
	if !p.exists(agentPath) {
		return ""
	}

	return parseAgentVersion(p.output(p.root+agentPath, "version"))
}

func (p prober) installedModules() []string {
	return parseInstalledModules(p.read(reportPath))
}

func (p prober) read(name string) []byte {
	raw, err := p.sys.ReadFile(p.root + name)
	if err != nil {
		return nil
	}

	return raw
}

func (p prober) exists(name string) bool {
	found, err := p.sys.Exists(p.root + name)

	return err == nil && found
}

func (p prober) output(argv ...string) string {
	out, err := p.sys.Run(sys.Command{Argv: argv})
	if err != nil {
		return ""
	}

	return out.Stdout
}

func smallest(first, second int64) int64 {
	switch {
	case first == 0:
		return second
	case second == 0:
		return first
	case first < second:
		return first
	}

	return second
}
