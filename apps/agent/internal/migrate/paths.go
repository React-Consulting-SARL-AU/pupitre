package migrate

import (
	"path"

	"pupitre.studio/agent/internal/keys"
	"pupitre.studio/agent/internal/license"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys/env"
)

const (
	DefaultDir     = "/etc/pupitre"
	DefaultLedger  = "/etc/pupitre/migrations.json"
	DefaultBackups = "/var/lib/pupitre/config-backups"

	// Everything the ledger owns is root-only under /etc/pupitre, so there is no mode to preserve.
	Mode = 0o600

	DefaultKeep = 5
)

// A name rather than a path, so a migration keeps its meaning when a path moves or is overridden.
type Target string

const (
	TargetInstall  Target = "install"
	TargetEnv      Target = "env"
	TargetProjects Target = "projects"
	// The pre-revision-1 local registry; only migration 1 reads it.
	TargetProjectsConf Target = "projects.local.conf"
	TargetSigners      Target = "signers.json"
	TargetLicense      Target = "license.json"
	// The licence cache's name until 2.0.0; only migration 8 reads it.
	TargetEntitlement Target = "entitlement.json"
)

type Paths struct {
	Dir      string
	Ledger   string
	Install  string
	Env      string
	Projects string
	Backups  string
	// The install lock, so a migration and an install never run at once; empty (tests only) means no lock.
	Lock string
	// dev's authorized_keys: a migration reads it, never writes it.
	Keys    string
	Signers string
	// The licence cache, under /var/lib/pupitre rather than /etc/pupitre: the daemon rewrites it on every read of the platform.
	License string
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

	if p.Keys == "" {
		p.Keys = keys.DefaultPath
	}

	if p.Signers == "" {
		p.Signers = keys.DefaultSignersPath
	}

	if p.License == "" {
		p.License = license.DefaultCachePath
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
	case TargetSigners:
		return resolved.Signers
	case TargetLicense:
		return resolved.License
	case TargetEntitlement:
		return path.Join(path.Dir(resolved.License), string(TargetEntitlement))
	}

	return path.Join(resolved.Dir, string(target))
}
