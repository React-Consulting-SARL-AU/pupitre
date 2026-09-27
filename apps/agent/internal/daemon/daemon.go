package daemon

import (
	"context"
	"errors"
	"os"
	"runtime"
	"strings"
	"sync"
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
	DefaultKeysPath          = keys.DefaultPath
	DefaultKeysOwner         = "dev"
	DefaultHostKeyPath       = "/etc/ssh/ssh_host_ed25519_key.pub"
)

type Options struct {
	Sys          sys.Sys
	Now          func() time.Time
	Platform     platform.Client
	Entitlement  *entitlement.Resolver
	Reader       *state.Reader
	AgentVersion string
	Arch         string
	TokenPath    string
	BaseURLPath  string
	ServerIDPath string
	Backups      Backups
	KeysPath     string
	KeysOwner    string
	SignersPath  string
	// Shared with every process that rewrites the signers or the block; empty takes no lock.
	KeysLock          string
	Euid              func() int
	HostKeyPath       string
	LogPath           string
	StateInterval     time.Duration
	HeartbeatInterval time.Duration
	// Rewrites what the modules generate after an update; retried on each state turn until it passes.
	Upkeep func() error
}

// Turn must return without holding the daemon loop.
type Backups interface {
	Turn()
	Beat() *contract.BackupBeat
}

type Daemon struct {
	options    Options
	journal    sys.Context
	lastReport string

	mu             sync.Mutex
	pending        []string
	pendingKnown   bool
	silentPlatform bool
	lastKeyHeld    bool
	upkept         bool
}

type Sync struct {
	Entitlement   contract.Entitlement
	Keys          []keys.Key
	KeysChanged   bool
	Pending       []string
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
	if options.ServerIDPath == "" {
		options.ServerIDPath = platform.DefaultServerIDPath
	}
	if options.KeysPath == "" {
		options.KeysPath = DefaultKeysPath
	}
	if options.KeysOwner == "" {
		options.KeysOwner = DefaultKeysOwner
	}
	if options.SignersPath == "" {
		options.SignersPath = keys.DefaultSignersPath
	}
	if options.Euid == nil {
		options.Euid = os.Geteuid
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

func (d *Daemon) Sync(ctx context.Context) (Sync, error) {
	return d.SyncAt(ctx, "")
}

// A key that starts or stops awaiting approval beats at once, so approving devices see it before the next heartbeat.
func (d *Daemon) SyncAt(ctx context.Context, platformURL string) (Sync, error) {
	synced, moved, err := d.read(ctx, platformURL)
	if err != nil || !moved {
		return synced, err
	}

	if err := d.Beat(ctx); err != nil {
		d.journal.Logf("heartbeat after the pending keys changed: %s", err)
	}

	return synced, nil
}

func (d *Daemon) read(ctx context.Context, platformURL string) (Sync, bool, error) {
	client, err := d.client(platformURL)
	if err != nil {
		return Sync{}, false, err
	}

	answer, err := client.State(ctx)
	if err != nil {
		if revoked(err) && d.stillHolds(client.Token) {
			d.revoke()
		}

		return Sync{}, false, err
	}

	if err := d.options.Entitlement.Remember(answer); err != nil {
		return Sync{}, false, err
	}

	d.keepServerID(client.Token, answer.ServerID)

	keysNow, err := d.settle(answer.Keys)
	if err != nil {
		return Sync{}, false, err
	}

	return Sync{
		Entitlement:   d.options.Entitlement.Current(),
		Keys:          keysNow.kept,
		KeysChanged:   keysNow.changed,
		Pending:       keysNow.pending,
		TargetVersion: answer.TargetVersion,
		SyncedAt:      d.options.Now(),
	}, keysNow.moved, nil
}

// A read made with a token an enrolment just replaced names the server it left, so only the on-disk token counts.
func (d *Daemon) keepServerID(token, id string) {
	d.mu.Lock()
	defer d.mu.Unlock()

	release, err := d.lockKeys()
	if err != nil {
		d.journal.Logf("server id not written: %s", err)

		return
	}
	defer release()

	if !d.stillHolds(token) {
		return
	}

	written, err := platform.SaveServerID(d.options.Sys, d.options.ServerIDPath, id)
	if err != nil {
		d.journal.Logf("server id %s not written to %s: %s", summary(id), d.options.ServerIDPath, err)

		return
	}

	if written {
		d.journal.Logf("server id %s written to %s", id, d.options.ServerIDPath)
	}
}

// Keys survive a revocation: withdrawing them could remove the owner's last way in.
func revoked(err error) bool {
	var failure *platform.Error

	return errors.As(err, &failure) && failure.Revoked()
}

func (d *Daemon) stillHolds(token string) bool {
	current, err := platform.LoadToken(d.options.Sys, d.options.TokenPath)

	return err == nil && current == token
}

func (d *Daemon) revoke() {
	d.journal.Logf("the platform no longer knows this server's token: revoked, entitlement suspended, keys kept")

	if err := d.options.Entitlement.Suspend(); err != nil {
		d.journal.Logf("entitlement not suspended: %s", err)
	}
}

func (d *Daemon) Entitlement() contract.Entitlement {
	return d.options.Entitlement.Current()
}

func (d *Daemon) Beat(ctx context.Context) error {
	client, err := d.client("")
	if err != nil {
		return err
	}

	return client.Beat(ctx, d.sample())
}

// Never carries a project name or a path: the platform only learns load and session kinds.
func (d *Daemon) sample() platform.Heartbeat {
	beat := platform.Heartbeat{
		StackVersion: d.options.AgentVersion,
		AgentVersion: d.options.AgentVersion,
		SSHUser:      d.options.KeysOwner,
		Sessions:     []string{},
		Modules:      []string{},
	}

	if d.options.Backups != nil {
		beat.Backup = d.options.Backups.Beat()
	}

	beat.Keys = d.keysBeat()

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

// The enrolment token comes from stdin and never touches the disk.
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

	if err := d.adopt(platformURL, serverToken); err != nil {
		return err
	}

	journal.Logf("server enrolled, token written to %s", d.options.TokenPath)

	return nil
}

// The URL is saved with the token so later reads never fall back to the hosted default; the old server id goes with the old token.
func (d *Daemon) adopt(platformURL, serverToken string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	release, err := d.lockKeys()
	if err != nil {
		return err
	}
	defer release()

	urlErr := platform.SaveBaseURL(d.options.Sys, d.options.BaseURLPath, platformURL)
	tokenErr := platform.SaveToken(d.options.Sys, d.options.TokenPath, serverToken)
	if err := errors.Join(urlErr, tokenErr); err != nil {
		return err
	}

	return platform.ForgetServerID(d.options.Sys, d.options.ServerIDPath)
}

// A platform echoing the enrolment token must not leak it into the refusal; a network cause stays verbatim.
func masked(journal *modules.Context, err error) error {
	var failure *platform.Error
	if !errors.As(err, &failure) {
		return errors.New(journal.Redact(err.Error()))
	}

	copied := *failure
	copied.Message = journal.Redact(failure.Message)

	return &copied
}

func (d *Daemon) enrolment(token string) *modules.Context {
	return modules.NewContext(modules.ContextOptions{
		Sys:      d.options.Sys,
		Now:      d.options.Now,
		Manifest: contract.Manifest{ID: "pupitred"},
		Secrets:  map[string]string{"enrollment_token": token},
		LogPath:  d.options.LogPath,
	})
}

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
	client, err := platform.Stored(d.options.Sys, d.options.Platform, d.options.TokenPath, d.options.BaseURLPath)
	if err != nil {
		return platform.Client{}, err
	}

	if platformURL != "" {
		client.BaseURL = platformURL
	}

	return client, nil
}

func (d *Daemon) platform(platformURL string) platform.Client {
	if platformURL == "" {
		return platform.Located(d.options.Sys, d.options.Platform, d.options.BaseURLPath)
	}

	client := d.options.Platform
	client.BaseURL = platformURL

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
