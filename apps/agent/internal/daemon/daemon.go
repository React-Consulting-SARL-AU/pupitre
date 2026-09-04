package daemon

import (
	"errors"
	"runtime"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/keys"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/platform"
	"pupitre.studio/agent/internal/state"
	"pupitre.studio/agent/internal/sys"
)

const (
	DefaultStateInterval     = 30 * time.Second
	DefaultHeartbeatInterval = 5 * time.Minute
	DefaultKeysPath          = "/home/dev/.ssh/authorized_keys"
	DefaultKeysOwner         = "dev"
	DefaultHostKeyPath       = "/etc/ssh/ssh_host_ed25519_key.pub"
)

type Options struct {
	Sys               sys.Sys
	Now               func() time.Time
	Platform          platform.Client
	Entitlement       *entitlement.Resolver
	Reader            *state.Reader
	AgentVersion      string
	Arch              string
	TokenPath         string
	KeysPath          string
	KeysOwner         string
	HostKeyPath       string
	LogPath           string
	StateInterval     time.Duration
	HeartbeatInterval time.Duration
}

// The outgoing half of the agent: it pulls what the platform knows and pushes what the machine is, and never listens.
type Daemon struct {
	options    Options
	journal    sys.Context
	lastReport string
}

type Sync struct {
	Entitlement   contract.Entitlement
	Keys          []keys.Key
	KeysChanged   bool
	TargetVersion string
	SyncedAt      time.Time
}

func New(options Options) *Daemon {
	if options.Now == nil {
		options.Now = time.Now
	}
	if options.TokenPath == "" {
		options.TokenPath = platform.DefaultTokenPath
	}
	if options.KeysPath == "" {
		options.KeysPath = DefaultKeysPath
	}
	if options.KeysOwner == "" {
		options.KeysOwner = DefaultKeysOwner
	}
	if options.HostKeyPath == "" {
		options.HostKeyPath = DefaultHostKeyPath
	}
	if options.Arch == "" {
		options.Arch = runtime.GOARCH
	}
	if options.StateInterval == 0 {
		options.StateInterval = DefaultStateInterval
	}
	if options.HeartbeatInterval == 0 {
		options.HeartbeatInterval = DefaultHeartbeatInterval
	}
	if options.Entitlement == nil {
		options.Entitlement = entitlement.New(entitlement.Options{Sys: options.Sys, Now: options.Now, TokenPath: options.TokenPath})
	}

	return &Daemon{
		options: options,
		journal: modules.NewContext(modules.ContextOptions{
			Sys:      options.Sys,
			Now:      options.Now,
			Manifest: contract.Manifest{ID: "pupitred"},
			LogPath:  options.LogPath,
		}),
	}
}

// One read of /agent/state: it renews the cached entitlement and brings the marked block of authorized_keys in line with the console.
func (d *Daemon) Sync() (Sync, error) {
	client, err := d.client()
	if err != nil {
		return Sync{}, err
	}

	answer, err := client.State()
	if err != nil {
		return Sync{}, err
	}

	if err := d.options.Entitlement.Remember(answer); err != nil {
		return Sync{}, err
	}

	wanted, refused := keys.ParseAll(answer.AuthorizedKeys)
	for _, line := range refused {
		d.journal.Logf("clé illisible ignorée : %s", summary(line))
	}

	changed, err := keys.Sync(d.journal, keys.Target{Path: d.options.KeysPath, Owner: d.options.KeysOwner}, wanted)
	if err != nil {
		return Sync{}, err
	}

	if changed {
		d.journal.Logf("%d clé(s) autorisée(s) dans %s", len(wanted), d.options.KeysPath)
	}

	return Sync{
		Entitlement:   d.options.Entitlement.Current(),
		Keys:          wanted,
		KeysChanged:   changed,
		TargetVersion: answer.TargetVersion,
		SyncedAt:      d.options.Now(),
	}, nil
}

func (d *Daemon) Beat() error {
	client, err := d.client()
	if err != nil {
		return err
	}

	return client.Beat(d.sample())
}

// The platform learns how full the machine is and what kind of sessions run on it, never a project name nor a path.
func (d *Daemon) sample() platform.Heartbeat {
	beat := platform.Heartbeat{
		StackVersion: d.options.AgentVersion,
		AgentVersion: d.options.AgentVersion,
		Sessions:     []string{},
		Modules:      []string{},
	}

	if d.options.Reader == nil {
		return beat
	}

	snapshot := d.options.Reader.Snapshot()
	beat.Disk = percent(snapshot.Machine.DiskTotalGB-snapshot.Machine.DiskFreeGB, snapshot.Machine.DiskTotalGB)
	beat.RAM = percent(float64(snapshot.Machine.RAMUsedMB), float64(snapshot.Machine.RAMTotalMB))
	if len(snapshot.Machine.Load) > 0 {
		beat.Load = snapshot.Machine.Load[0]
	}

	for _, session := range snapshot.Sessions {
		beat.Sessions = append(beat.Sessions, string(session.Kind))
	}

	for _, service := range snapshot.Services {
		beat.Modules = append(beat.Modules, service.ID)
	}

	return beat
}

// The enrolment token buys a server token and nothing else; it is read from the standard input and never lands on the disk.
func (d *Daemon) Enroll(token string) error {
	token = strings.TrimSpace(token)
	if token == "" {
		return errors.New("jeton d'enrôlement vide")
	}

	hostKey, err := d.hostPublicKey()
	if err != nil {
		return err
	}

	serverToken, err := d.options.Platform.Exchange(platform.Enrollment{
		Token:         token,
		HostPublicKey: hostKey,
		AgentVersion:  d.options.AgentVersion,
		Arch:          d.options.Arch,
	})
	if err != nil {
		return err
	}

	if err := platform.SaveToken(d.options.Sys, d.options.TokenPath, serverToken); err != nil {
		return err
	}

	d.journal.Logf("serveur enrôlé, jeton écrit dans %s", d.options.TokenPath)

	return nil
}

// The app pins this key the moment it enrols: what it sees on its own ssh connection has to be what the server declared.
func (d *Daemon) hostPublicKey() (string, error) {
	raw, err := d.options.Sys.ReadFile(d.options.HostKeyPath)
	if err != nil {
		return "", errors.New("clé d'hôte illisible : " + d.options.HostKeyPath)
	}

	line := strings.TrimSpace(string(raw))
	if _, err := keys.ParseLine(line); err != nil {
		return "", errors.New("clé d'hôte illisible : " + err.Error())
	}

	return line, nil
}

func (d *Daemon) Keys() []keys.Key {
	return keys.Listed(d.journal, d.options.KeysPath)
}

func (d *Daemon) SyncedAt() time.Time {
	return d.options.Entitlement.SyncedAt()
}

func (d *Daemon) client() (platform.Client, error) {
	token, err := platform.LoadToken(d.options.Sys, d.options.TokenPath)
	if err != nil {
		return platform.Client{}, err
	}

	client := d.options.Platform
	client.Token = token

	return client, nil
}

func percent(used, total float64) float64 {
	if total <= 0 {
		return 0
	}

	return used / total * 100
}

func summary(line string) string {
	if len(line) > 40 {
		return line[:40] + "…"
	}

	return line
}
