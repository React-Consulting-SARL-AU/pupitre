package selfupdate

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"runtime"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/migrate"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/platform"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/lock"
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	DefaultBinaryPath = "/usr/local/bin/pupitred"
	DefaultUnit       = "pupitred"
	DefaultLockPath   = "/var/lib/pupitre/upgrade.lock"
	binaryMode        = 0o755
	healthTimeout     = 30 * time.Second
)

type Options struct {
	Sys        sys.Sys
	Now        func() time.Time
	Version    string
	Arch       string
	BinaryPath string
	TokenPath  string
	Unit       string
	LogPath    string
	Platform   platform.Client
	PublicKey  ed25519.PublicKey
	// Migrator is this binary's ledger: what a rollback puts back when the new binary migrated before failing.
	Migrator Migrator
	// UpgradeLock keeps a second upgrade out; InstallLock is the one installs, backups and restores hold, which a restart would cut short. Empty is no lock, which is the tests' case.
	UpgradeLock string
	InstallLock string
}

type Migrator interface {
	Ledger() migrate.Ledger
	Backups() []migrate.Backup
	Restore(name string) (migrate.Result, error)
}

type configBefore struct {
	revision int
	batches  map[string]bool
}

type Request struct {
	Version        string
	Signature      string
	AllowDowngrade bool
}

// What the agent verifies against, once the platform has said it: the expected fingerprint and the signature that binds it to a version and an architecture.
type published struct {
	Fingerprint string
	Signature   []byte
}

type Result struct {
	PreviousVersion string `json:"previous_version"`
	Version         string `json:"version"`
	Restarting      bool   `json:"restarting"`
}

type Upgrader struct {
	options Options
}

func New(options Options) *Upgrader {
	return &Upgrader{options: options}
}

func (u *Upgrader) Upgrade(request Request) (Result, error) {
	ctx := u.context()

	key, err := u.publicKey()
	if err != nil {
		return Result{}, unverifiable(err)
	}

	token, err := platform.LoadToken(u.options.Sys, u.options.TokenPath)
	if err != nil {
		return Result{}, protocol.NewError(contract.ErrorBadRequest, err.Error()).
			WithFix(i18n.T("selfupdate.token.missing.fix"))
	}

	unlock, err := hold(u.options.UpgradeLock, upgradeBusy)
	if err != nil {
		return Result{}, err
	}
	defer unlock()

	client := u.options.Platform
	client.Token = token

	state, stateErr := client.State(context.Background())

	version, err := u.resolve(request.Version, state, stateErr)
	if err != nil {
		return Result{}, err
	}

	if err := u.holdTheFloor(ctx, request, version, state, stateErr); err != nil {
		return Result{}, err
	}

	release, err := u.published(ctx, client, version, request.Signature)
	if err != nil {
		return Result{}, err
	}

	binary, err := client.Release(context.Background(), version)
	if err != nil {
		return Result{}, downloadFailed(version, err)
	}

	fingerprint := Fingerprint(binary)
	ctx.Logf("version %s downloaded, %d bytes, fingerprint %s", version, len(binary), fingerprint)

	if release.Fingerprint != "" && release.Fingerprint != fingerprint {
		return Result{}, corrupted(version, release.Fingerprint, fingerprint)
	}

	if !Verify(key, version, u.arch(), fingerprint, release.Signature) {
		return Result{}, badSignature(version)
	}

	return u.install(ctx, version, binary)
}

// The platform's own word beats what the caller hands over; the parameter is the way back for an agent whose platform is out of reach.
func (u *Upgrader) published(ctx sys.Context, client platform.Client, version, offered string) (published, error) {
	info, err := client.ReleaseMetadata(context.Background(), version)
	if err == nil {
		signature, decodeErr := DecodeSignature(info.Signature)
		if decodeErr != nil {
			return published{}, unverifiable(decodeErr)
		}

		return published{Fingerprint: info.SHA256, Signature: signature}, nil
	}

	if offered == "" {
		return published{}, metadataFailed(version, err)
	}

	ctx.Logf("fingerprint of version %s unreadable (%s), falling back to the signature from the parameters", version, err)

	signature, decodeErr := DecodeSignature(offered)
	if decodeErr != nil {
		return published{}, unverifiable(decodeErr)
	}

	return published{Signature: signature}, nil
}

// A signature never expires, so nothing but this refusal stops an old and faulty version from being installed again.
func (u *Upgrader) holdTheFloor(ctx sys.Context, request Request, version string, state platform.State, stateErr error) error {
	floor := u.floor(state, stateErr)

	if floor == "" || !Older(version, floor) {
		return nil
	}

	if request.AllowDowngrade {
		ctx.Logf("floor %s lifted at the owner's request to install %s", floor, version)

		return nil
	}

	return refusedDowngrade(version, floor)
}

// The running version is known without asking anyone, which is what makes it the floor that holds when the platform is out of reach; what the platform remembers can only raise it. A build that is not a version — dev — is no floor at all.
func (u *Upgrader) floor(state platform.State, stateErr error) string {
	floor := ""
	if _, semver := parseVersion(u.options.Version); semver {
		floor = u.options.Version
	}

	if stateErr != nil || state.MinimumVersion == "" {
		return floor
	}

	if floor == "" || Older(floor, state.MinimumVersion) {
		return state.MinimumVersion
	}

	return floor
}

// Nothing has touched the disk before this point: a binary that failed verification is never written anywhere.
func (u *Upgrader) install(ctx sys.Context, version string, binary []byte) (Result, error) {
	previous, err := ctx.Sys().ReadFile(u.binaryPath())
	if err != nil {
		return Result{}, protocol.NewError(contract.ErrorInternal, i18n.T("selfupdate.binary.unreadable", u.binaryPath(), err)).
			WithFix(i18n.T("selfupdate.root.required.fix"))
	}

	if bytes.Equal(previous, binary) {
		ctx.Logf("version %s already in place, nothing to replace", version)

		return Result{PreviousVersion: u.options.Version, Version: version, Restarting: false}, nil
	}

	// A restart kills whatever the daemon runs, a scheduled backup included; the lock goes once the new unit is up, so the new binary can migrate.
	release, err := hold(u.options.InstallLock, installBusy)
	if err != nil {
		return Result{}, err
	}

	before := u.configBefore()

	if err := ctx.Sys().WriteFile(u.binaryPath(), binary, binaryMode); err != nil {
		release()

		return Result{}, protocol.NewError(contract.ErrorInternal, i18n.T("selfupdate.replace.failed", u.binaryPath(), err)).
			WithFix(i18n.T("selfupdate.replace.failed.fix"))
	}

	restarting, err := u.restart(ctx)
	release()

	if err != nil {
		return u.rollback(ctx, previous, before, restartFailed(version, err))
	}

	running, err := u.hello(ctx)
	if err != nil {
		return u.rollback(ctx, previous, before, silent(version, u.options.Version, err))
	}

	ctx.Logf("agent %s installed, unit %s restarted", running, u.unit())

	return Result{PreviousVersion: u.options.Version, Version: running, Restarting: restarting}, nil
}

// The previous binary never left memory, so putting it back needs nothing from the disk that the failed upgrade could have spoiled.
func (u *Upgrader) rollback(ctx sys.Context, previous []byte, before configBefore, cause error) (Result, error) {
	if err := ctx.Sys().WriteFile(u.binaryPath(), previous, binaryMode); err != nil {
		return Result{}, protocol.NewError(contract.ErrorInternal,
			i18n.T("selfupdate.rollback.failed", cause, err)).
			WithFix(i18n.T("selfupdate.rollback.failed.fix"))
	}

	// Before the restart: the previous binary refuses a configuration ahead of its own revision.
	unrestored := u.restoreConfig(ctx, before)

	if _, err := u.restart(ctx); err != nil {
		ctx.Logf("unit %s not restarted after the rollback: %s", u.unit(), err)
	}

	ctx.Logf("rolled back to agent %s", u.options.Version)

	if unrestored != nil {
		return Result{}, protocol.NewError(contract.ErrorInternal, i18n.T("selfupdate.config.unrestored", cause, unrestored)).
			WithFix(i18n.T("selfupdate.config.unrestored.fix"))
	}

	return Result{}, cause
}

func (u *Upgrader) configBefore() configBefore {
	if u.options.Migrator == nil {
		return configBefore{}
	}

	before := configBefore{revision: u.options.Migrator.Ledger().Revision, batches: map[string]bool{}}
	for _, batch := range u.options.Migrator.Backups() {
		before.batches[batch.Name] = true
	}

	return before
}

// The batch to put back is the one the new binary took: new since the upgrade began, and taken from the revision this binary reads.
func (u *Upgrader) restoreConfig(ctx sys.Context, before configBefore) error {
	if u.options.Migrator == nil || u.options.Migrator.Ledger().Revision == before.revision {
		return nil
	}

	for _, batch := range u.options.Migrator.Backups() {
		if before.batches[batch.Name] || batch.From != before.revision {
			continue
		}

		if _, err := u.options.Migrator.Restore(batch.Name); err != nil {
			return err
		}

		ctx.Logf("configuration put back to revision %d from %s", before.revision, batch.Name)

		return nil
	}

	return errors.New(i18n.T("selfupdate.config.batch.missing", before.revision))
}

func hold(path string, busy func() *protocol.Error) (func(), error) {
	release, held, err := lock.Acquire(path)
	if err != nil {
		return nil, err
	}

	if !held {
		return nil, busy()
	}

	return release, nil
}

func (u *Upgrader) restart(ctx sys.Context) (bool, error) {
	if !systemd.Loaded(ctx, u.unit()) {
		ctx.Logf("unit %s absent, no restart", u.unit())

		return false, nil
	}

	if err := systemd.Restart(ctx, u.unit()); err != nil {
		return false, err
	}

	return true, nil
}

type helloAnswer struct {
	OK     bool `json:"ok"`
	Result struct {
		AgentVersion string `json:"agent_version"`
	} `json:"result"`
	Error *protocol.Error `json:"error"`
}

// Identity is what `pupitred version --json` prints: the version, and the protocol generation the binary speaks.
type Identity struct {
	Version  string `json:"version"`
	Protocol int    `json:"protocol"`
}

// spoken is the protocol the new binary says it speaks; one too old to say is asked in this binary's own.
func (u *Upgrader) spoken(ctx sys.Context) int {
	out, err := sys.Exec(ctx, sys.Command{Argv: []string{u.binaryPath(), "version", "--json"}, Timeout: healthTimeout})
	if err != nil {
		return contract.ProtocolVersion
	}

	var identity Identity
	if err := json.Unmarshal([]byte(firstLine(out.Stdout)), &identity); err != nil || identity.Protocol <= 0 {
		return contract.ProtocolVersion
	}

	return identity.Protocol
}

// The new binary is asked the one question the app asks first, on its own protocol channel: an agent that cannot answer hello has not been installed, it has been lost.
// It is asked in the protocol it speaks: an upgrade to a new generation is an upgrade, which the app then follows, not a binary to roll back.
func (u *Upgrader) hello(ctx sys.Context) (string, error) {
	request, err := json.Marshal(map[string]any{
		"id":     1,
		"cmd":    "hello",
		"params": map[string]any{"app_version": u.options.Version, "protocol": u.spoken(ctx)},
	})
	if err != nil {
		return "", err
	}

	out, err := sys.Exec(ctx, sys.Command{
		Argv:    []string{u.binaryPath(), "serve"},
		Stdin:   append(request, '\n'),
		Timeout: healthTimeout,
	})
	if err != nil {
		return "", err
	}

	var answer helloAnswer
	if err := json.Unmarshal([]byte(firstLine(out.Stdout)), &answer); err != nil {
		return "", errors.New("unreadable answer to hello")
	}

	if !answer.OK {
		return "", errors.New(reason(answer.Error))
	}

	if answer.Result.AgentVersion == "" {
		return "", errors.New("hello without an agent version")
	}

	return answer.Result.AgentVersion, nil
}

func (u *Upgrader) resolve(wanted string, state platform.State, stateErr error) (string, error) {
	if wanted != "" {
		return wanted, nil
	}

	if stateErr != nil {
		return "", stateFailed(stateErr)
	}

	if state.TargetVersion == "" {
		return "", protocol.NewError(contract.ErrorBadRequest, i18n.T("selfupdate.target.none")).
			WithFix(i18n.T("selfupdate.state.unreadable.fix"))
	}

	return state.TargetVersion, nil
}

func (u *Upgrader) publicKey() (ed25519.PublicKey, error) {
	if len(u.options.PublicKey) == ed25519.PublicKeySize {
		return u.options.PublicKey, nil
	}

	return EmbeddedPublicKey()
}

func (u *Upgrader) context() sys.Context {
	return modules.NewContext(modules.ContextOptions{
		Sys:      u.options.Sys,
		Now:      u.options.Now,
		Manifest: contract.Manifest{ID: "pupitred"},
		LogPath:  u.options.LogPath,
	})
}

func (u *Upgrader) arch() string {
	if u.options.Arch != "" {
		return u.options.Arch
	}

	return runtime.GOARCH
}

func (u *Upgrader) binaryPath() string {
	if u.options.BinaryPath != "" {
		return u.options.BinaryPath
	}

	return DefaultBinaryPath
}

func (u *Upgrader) unit() string {
	if u.options.Unit != "" {
		return u.options.Unit
	}

	return DefaultUnit
}

func firstLine(output string) string {
	for _, line := range bytes.Split([]byte(output), []byte("\n")) {
		if trimmed := bytes.TrimSpace(line); len(trimmed) > 0 {
			return string(trimmed)
		}
	}

	return ""
}

func reason(failure *protocol.Error) string {
	if failure == nil {
		return "hello refused without a reason"
	}

	return string(failure.Code) + " : " + failure.Message
}
