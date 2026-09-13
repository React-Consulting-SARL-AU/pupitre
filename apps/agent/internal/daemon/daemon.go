package daemon

import (
	"context"
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
	BaseURLPath       string
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
	if options.BaseURLPath == "" {
		options.BaseURLPath = platform.DefaultBaseURLPath
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
func (d *Daemon) Sync(ctx context.Context) (Sync, error) {
	return d.SyncAt(ctx, "")
}

// The same read, against the platform the caller names: an enrolment reads the state of the platform it just traded with.
func (d *Daemon) SyncAt(ctx context.Context, platformURL string) (Sync, error) {
	client, err := d.client(platformURL)
	if err != nil {
		return Sync{}, err
	}

	answer, err := client.State(ctx)
	if err != nil {
		return Sync{}, err
	}

	if err := d.options.Entitlement.Remember(answer); err != nil {
		return Sync{}, err
	}

	wanted, refused := keys.ParseAll(answer.AuthorizedKeys)
	for _, line := range refused {
		d.journal.Logf("unreadable key ignored: %s", summary(line))
	}

	changed, err := keys.Sync(d.journal, keys.Target{Path: d.options.KeysPath, Owner: d.options.KeysOwner}, wanted)
	if err != nil {
		return Sync{}, err
	}

	if changed {
		d.journal.Logf("%d authorized key(s) in %s", len(wanted), d.options.KeysPath)
	}

	return Sync{
		Entitlement:   d.options.Entitlement.Current(),
		Keys:          wanted,
		KeysChanged:   changed,
		TargetVersion: answer.TargetVersion,
		SyncedAt:      d.options.Now(),
	}, nil
}

func (d *Daemon) Beat(ctx context.Context) error {
	client, err := d.client("")
	if err != nil {
		return err
	}

	return client.Beat(ctx, d.sample())
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
	beat.DiskTotalGB = snapshot.Machine.DiskTotalGB
	beat.DiskFreeGB = snapshot.Machine.DiskFreeGB
	beat.RAMTotalMB = float64(snapshot.Machine.RAMTotalMB)
	beat.RAMUsedMB = float64(snapshot.Machine.RAMUsedMB)
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
func (d *Daemon) Enroll(ctx context.Context, token, platformURL string) error {
	token = strings.TrimSpace(token)
	if token == "" {
		return errors.New("empty enrolment token")
	}

	journal := d.enrolment(token)

	hostKey, err := d.hostPublicKey()
	if err != nil {
		return err
	}

	serverToken, err := d.platform(platformURL).Exchange(ctx, platform.Enrollment{
		Token:         token,
		HostPublicKey: hostKey,
		AgentVersion:  d.options.AgentVersion,
		Arch:          d.options.Arch,
	})
	if err != nil {
		return masked(journal, err)
	}

	// The platform is written down before the token: the heartbeat and the
	// entitlement run without the app, and a token without its platform would
	// have a development console traded with once and then looked for at the
	// hosted address for ever.
	urlErr := platform.SaveBaseURL(d.options.Sys, d.options.BaseURLPath, platformURL)
	tokenErr := platform.SaveToken(d.options.Sys, d.options.TokenPath, serverToken)
	if err := errors.Join(urlErr, tokenErr); err != nil {
		return err
	}

	journal.Logf("server enrolled, token written to %s", d.options.TokenPath)

	return nil
}

// A platform that echoes the enrolment token back would otherwise put it in
// the refusal the app displays and logs. The cause is kept as it is: it is
// the network's word, never the platform's, and it is what names a timeout.
func masked(journal *modules.Context, err error) error {
	var failure *platform.Error
	if !errors.As(err, &failure) {
		return errors.New(journal.Redact(err.Error()))
	}

	copied := *failure
	copied.Message = journal.Redact(failure.Message)

	return &copied
}

// A journal that knows the token, so a platform that echoes it back writes [secret] rather than the token itself.
func (d *Daemon) enrolment(token string) *modules.Context {
	return modules.NewContext(modules.ContextOptions{
		Sys:      d.options.Sys,
		Now:      d.options.Now,
		Manifest: contract.Manifest{ID: "pupitred"},
		Secrets:  map[string]string{"enrollment_token": token},
		LogPath:  d.options.LogPath,
	})
}

// The app pins this key the moment it enrols: what it sees on its own ssh connection has to be what the server declared.
func (d *Daemon) hostPublicKey() (string, error) {
	raw, err := d.options.Sys.ReadFile(d.options.HostKeyPath)
	if err != nil {
		return "", errors.New("unreadable host key: " + d.options.HostKeyPath)
	}

	line := strings.TrimSpace(string(raw))
	if _, err := keys.ParseLine(line); err != nil {
		return "", errors.New("unreadable host key: " + err.Error())
	}

	return line, nil
}

func (d *Daemon) Keys() []keys.Key {
	return keys.Listed(d.journal, d.options.KeysPath)
}

func (d *Daemon) SyncedAt() time.Time {
	return d.options.Entitlement.SyncedAt()
}

func (d *Daemon) client(platformURL string) (platform.Client, error) {
	token, err := platform.LoadToken(d.options.Sys, d.options.TokenPath)
	if err != nil {
		return platform.Client{}, err
	}

	client := d.platform(platformURL)
	client.Token = token

	return client, nil
}

// The address the caller names wins; a caller that names none — the heartbeat,
// a sync of its own accord — falls back to the one the enrolment wrote down,
// then to whatever this build was told at launch.
func (d *Daemon) platform(platformURL string) platform.Client {
	client := d.options.Platform

	if platformURL == "" {
		platformURL = platform.LoadBaseURL(d.options.Sys, d.options.BaseURLPath)
	}

	if platformURL != "" {
		client.BaseURL = platformURL
	}

	return client
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
