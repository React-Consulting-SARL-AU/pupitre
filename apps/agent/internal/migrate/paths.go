package migrate

import (
	"path"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys/env"
)

const (
	DefaultDir     = "/etc/pupitre"
	DefaultLedger  = "/etc/pupitre/migrations.json"
	DefaultBackups = "/var/lib/pupitre/config-backups"

	// Everything the ledger owns lives under /etc/pupitre, root and 0600. There
	// is no mode to preserve, so a migration never has to ask for one.
	Mode = 0o600

	// How many batches of previous files stay on the machine. Five covers the
	// releases between two visits without turning a folder of small files into
	// a place one has to think about.
	DefaultKeep = 5
)

// Target names a file the ledger owns, rather than a path.
//
// A migration written today has to keep meaning the same thing when a path
// moves or an environment variable overrides it, so it names what it touches
// and the runner resolves it. A name nobody declared resolves under
// /etc/pupitre, which is where the agent's configuration lives.
type Target string

const (
	TargetInstall  Target = "install"
	TargetEnv      Target = "env"
	TargetProjects Target = "projects"
	// TargetProjectsConf is the local registry as it was written before revision 1, and only migration 1 reads it.
	TargetProjectsConf Target = "projects.local.conf"
)

type Paths struct {
	Dir      string
	Ledger   string
	Install  string
	Env      string
	Projects string
	Backups  string
	// Lock is the install lock: a migration and an install never run at once.
	// Empty means no lock, which is the tests' case and nobody else's.
	Lock string
}

func (p Paths) Resolved() Paths {
	if p.Dir == "" {
		p.Dir = DefaultDir
	}
	if p.Ledger == "" {
		p.Ledger = DefaultLedger
	}
	if p.Install == "" {
		p.Install = modules.DefaultInstallPath
	}
	if p.Env == "" {
		p.Env = env.Path
	}
	if p.Projects == "" {
		p.Projects = registry.DefaultLocal
	}
	if p.Backups == "" {
		p.Backups = DefaultBackups
	}

	return p
}

func (p Paths) Of(target Target) string {
	resolved := p.Resolved()

	switch target {
	case TargetInstall:
		return resolved.Install
	case TargetEnv:
		return resolved.Env
	case TargetProjects:
		return resolved.Projects
	}

	return path.Join(resolved.Dir, string(target))
}
