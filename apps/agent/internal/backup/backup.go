// Package backup makes and restores a server's backups; docs/contracts/backups.md is the contract.
package backup

import (
	"regexp"
	"sync/atomic"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/migrate"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/platform"
	"pupitre.studio/agent/internal/s3"
	"pupitre.studio/agent/internal/state"
)

const (
	DefaultStatePath   = "/var/lib/pupitre/backup.json"
	DefaultMarkerPath  = "/var/lib/pupitre/restore.json"
	DefaultStagingPath = "/var/lib/pupitre/restore"
	DefaultHome        = "/home/dev"
	DefaultOwner       = "dev"

	partSuffix = ".pupitre"

	// The replay a failed part of a backup names: the whole backup again, which copies what did not change.
	replayRun = "sudo pupitred dev backup now"
)

var idPattern = regexp.MustCompile(contract.Backup.IDPattern)

// SetupFile is one file of the configuration: its name in the setup archive, and where it lives on this machine.
type SetupFile struct {
	Name string
	Path string
}

// Setup lists the configuration a backup carries, under the names the contract gives them.
func Setup(install, local, conf, ledger, env, running string) []SetupFile {
	return []SetupFile{
		{Name: "etc/pupitre/install.json", Path: install},
		{Name: "etc/pupitre/projects.local.json", Path: local},
		{Name: "etc/pupitre/projects.conf", Path: conf},
		{Name: "etc/pupitre/migrations.json", Path: ledger},
		{Name: "etc/pupitre/env", Path: env},
		{Name: "var/lib/pupitre/projects.running.json", Path: running},
	}
}

type Paths struct {
	State    string
	Marker   string
	Staging  string
	ServerID string
	Home     string
	Setup    []SetupFile
}

func (p Paths) resolved() Paths {
	if p.State == "" {
		p.State = DefaultStatePath
	}
	if p.Marker == "" {
		p.Marker = DefaultMarkerPath
	}
	if p.Staging == "" {
		p.Staging = DefaultStagingPath
	}
	if p.ServerID == "" {
		p.ServerID = platform.DefaultServerIDPath
	}
	if p.Home == "" {
		p.Home = DefaultHome
	}

	return p
}

type Options struct {
	Engine       *modules.Engine
	Reader       *state.Reader
	Migrate      migrate.Options
	Platform     func() (platform.Client, error)
	AgentVersion string
	Paths        Paths
	Owner        string
	Now          func() time.Time
	Location     *time.Location
	// Reach adjusts the client of a bucket before it is used: the tests aim it at their fake one.
	Reach func(s3.Client) s3.Client
}

type Service struct {
	options Options
	paths   Paths
	// A scheduled backup runs apart from the daemon's loop, one at a time.
	turning atomic.Bool
}

func New(options Options) *Service {
	if options.Now == nil {
		options.Now = time.Now
	}
	if options.Location == nil {
		options.Location = time.Local
	}
	if options.Owner == "" {
		options.Owner = DefaultOwner
	}

	return &Service{options: options, paths: options.Paths.resolved()}
}

func (s *Service) now() time.Time {
	return s.options.Now()
}

func (s *Service) bucket(client s3.Client) s3.Client {
	if s.options.Reach != nil {
		return s.options.Reach(client)
	}

	return client
}

// ServerID is what the platform names this server by, once a read of /agent/state has said it: hello answers it, and it names the server's prefix in the bucket.
func (s *Service) ServerID() string {
	return platform.LoadServerID(s.options.Engine.Sys, s.paths.ServerID)
}
