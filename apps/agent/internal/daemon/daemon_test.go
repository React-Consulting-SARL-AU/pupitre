package daemon_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/daemon"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/keys"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/platform"
	"pupitre.studio/agent/internal/protocol"
)

const (
	laptop  = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILykUfO8a7qKBQHbW/KSfnaTtl1nAJxVpOzifJBri1Hl jordan@laptop"
	own     = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFYbYqYFCzS+wnaB9G7NkFuFRPlBRbxJqcVJ0m8OvXKp secours"
	hostKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINPmg2sJ7wUW1eUeGGiuIYbYVWH8ihu5xMt/M39EO4Bd root@vps"
)

var noon = time.Date(2026, time.September, 4, 12, 0, 0, 0, time.UTC)

type fakePlatform struct {
	mu sync.Mutex

	legacy     []string
	keys       *[]contract.AgentStateKey
	state      string
	validUntil time.Time
	target     string
	refuse     int
	refuseCode string
	refused    func()

	echo     bool
	serverID string

	states   int
	beats    []platform.Heartbeat
	rawBeats [][]byte
	traded   []platform.Enrollment
}

func newPlatform() *fakePlatform {
	return &fakePlatform{state: "valid", validUntil: noon.Add(24 * time.Hour), target: "1.4.0", serverID: serverID}
}

func (p *fakePlatform) serve() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p.mu.Lock()
		defer p.mu.Unlock()

		if p.refuse != 0 {
			if p.refused != nil {
				p.refused()
			}

			w.WriteHeader(p.refuse)
			w.Write([]byte(`{"error":{"code":"` + p.refuseCode + `","message":"jeton inconnu"}}`))

			return
		}

		switch r.URL.Path {
		case "/agent/state":
			p.states++
			answer := map[string]any{
				"entitlement":     p.state,
				"valid_until":     p.validUntil,
				"authorized_keys": p.legacy,
				"target_version":  p.target,
				"hostname":        "vps",
				"server_id":       p.serverID,
			}
			if p.keys != nil {
				answer["keys"] = *p.keys
			}
			json.NewEncoder(w).Encode(answer)
		case "/agent/heartbeat":
			raw, _ := io.ReadAll(r.Body)
			var beat platform.Heartbeat
			json.Unmarshal(raw, &beat)
			p.beats = append(p.beats, beat)
			p.rawBeats = append(p.rawBeats, raw)
			w.WriteHeader(http.StatusNoContent)
		case "/agent/exchange":
			var enrollment platform.Enrollment
			json.NewDecoder(r.Body).Decode(&enrollment)
			p.traded = append(p.traded, enrollment)

			if p.echo {
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]any{
					"error": map[string]string{"code": "invalid_enrollment_token", "message": "jeton " + enrollment.Token + " inconnu"},
				})

				return
			}

			w.Write([]byte(`{"server_token":"jeton-de-serveur"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
}

func (p *fakePlatform) want(entries ...contract.AgentStateKey) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if entries == nil {
		entries = []contract.AgentStateKey{}
	}
	p.keys = &entries
}

// A platform older than approvals: bare lines the agent no longer reads.
func (p *fakePlatform) allow(lines ...string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.legacy = lines
	p.keys = nil
}

func (p *fakePlatform) suspend(status int) {
	p.refuseWith(status, "invalid_server_token")
}

func (p *fakePlatform) refuseWith(status int, code string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.refuse = status
	p.refuseCode = code
}

func (p *fakePlatform) echoRefusals() {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.echo = true
}

func (p *fakePlatform) count() int {
	p.mu.Lock()
	defer p.mu.Unlock()

	return p.states
}

func (p *fakePlatform) heartbeats() []platform.Heartbeat {
	p.mu.Lock()
	defer p.mu.Unlock()

	return slices.Clone(p.beats)
}

type bench struct {
	fake     *modtest.FakeSys
	platform *fakePlatform
	server   *httptest.Server
	now      time.Time
	logPath  string
}

func newBench(t *testing.T, enrolled bool) *bench {
	t.Helper()

	fake := modtest.NewFakeSys()
	fake.Files[daemon.DefaultKeysPath] = []byte(own + "\n")
	fake.Files[daemon.DefaultHostKeyPath] = []byte(hostKey + "\n")
	if enrolled {
		fake.Files[platform.DefaultTokenPath] = []byte("jeton-de-serveur\n")
	}

	b := &bench{fake: fake, platform: newPlatform(), now: noon, logPath: filepath.Join(t.TempDir(), "pupitre.log")}
	b.server = b.platform.serve()
	t.Cleanup(b.server.Close)

	return b
}

func (b *bench) agent() *daemon.Daemon {
	return daemon.New(b.options())
}

func (b *bench) journal() string {
	raw, err := os.ReadFile(b.logPath)
	if err != nil {
		return ""
	}

	return string(raw)
}

func (b *bench) authorized() string {
	return string(b.fake.Files[daemon.DefaultKeysPath])
}

func (b *bench) sync(t *testing.T, agent *daemon.Daemon) daemon.Sync {
	t.Helper()

	synced, err := agent.Sync(context.Background())
	if err != nil {
		t.Fatalf("Sync: %v", err)
	}

	return synced
}

func TestAKeyApprovedByATrustedDeviceOpensTheServer(t *testing.T) {
	b := newBench(t, true)
	b.trusting(t, laptopDevice)
	b.platform.want(asked(laptopDevice), asked(desktopDevice, laptopDevice.approves(t, desktopDevice, b.now.Add(-time.Minute))))

	synced := b.sync(t, b.agent())
	if !synced.KeysChanged || len(synced.Keys) != 2 || len(synced.Pending) != 0 || synced.TargetVersion != "1.4.0" {
		t.Fatalf("synced = %+v", synced)
	}

	if !b.opens(desktopDevice) || !b.opens(laptopDevice) || !strings.Contains(b.authorized(), own) {
		t.Fatalf("authorized_keys:\n%s", b.authorized())
	}

	trust := b.trust(t)
	if !trust.Trusts(desktopDevice.fingerprint(t)) || trust.Signers[1].Via != keys.ViaApproval {
		t.Fatalf("an admitted key becomes a signer: %+v", trust)
	}

	if synced.Entitlement == contract.EntitlementRestricted {
		t.Fatalf("a read that just succeeded restricts the agent: %s", synced.Entitlement)
	}
}

func TestAKeyWithoutApprovalWaitsAndThePlatformHearsItAtOnce(t *testing.T) {
	b := newBench(t, true)
	b.trusting(t, laptopDevice)
	b.platform.want(asked(laptopDevice), asked(desktopDevice))

	synced := b.sync(t, b.agent())
	if b.opens(desktopDevice) || !b.opens(laptopDevice) {
		t.Fatalf("authorized_keys:\n%s", b.authorized())
	}

	if len(synced.Pending) != 1 || synced.Pending[0] != desktopDevice.fingerprint(t) {
		t.Fatalf("pending = %v", synced.Pending)
	}

	beats := b.platform.heartbeats()
	if len(beats) != 1 || beats[0].Keys == nil {
		t.Fatalf("heartbeats = %+v", beats)
	}

	if !slices.Equal(beats[0].Keys.Pending, synced.Pending) || !slices.Equal(beats[0].Keys.Signers, []string{laptopDevice.fingerprint(t)}) {
		t.Fatalf("keys beat = %+v", beats[0].Keys)
	}

	if err := contract.ValidateValue("KeysBeat", beats[0].Keys); err != nil {
		t.Fatal(err)
	}
}

func TestTheSamePendingSetDoesNotBeatAgain(t *testing.T) {
	b := newBench(t, true)
	b.trusting(t, laptopDevice)
	b.platform.want(asked(laptopDevice), asked(desktopDevice))

	agent := b.agent()
	b.sync(t, agent)
	b.sync(t, agent)

	if beats := b.platform.heartbeats(); len(beats) != 1 {
		t.Fatalf("%d heartbeat(s), want one", len(beats))
	}

	b.platform.want(asked(laptopDevice), asked(desktopDevice, laptopDevice.approves(t, desktopDevice, b.now)))
	b.sync(t, agent)

	beats := b.platform.heartbeats()
	if len(beats) != 2 || len(beats[1].Keys.Pending) != 0 || len(beats[1].Keys.Signers) != 2 {
		t.Fatalf("heartbeats = %+v", beats)
	}

	b.platform.mu.Lock()
	raw := b.platform.rawBeats[1]
	b.platform.mu.Unlock()

	if !bytes.Contains(raw, []byte(`"pending":[]`)) {
		t.Fatalf("an empty pending set must travel as a list, the platform refuses null: %s", raw)
	}
}

func TestAChainOfApprovalsOpensInOneRead(t *testing.T) {
	b := newBench(t, true)
	b.trusting(t, laptopDevice)
	b.platform.want(
		asked(phoneDevice, desktopDevice.approves(t, phoneDevice, b.now)),
		asked(desktopDevice, laptopDevice.approves(t, desktopDevice, b.now)),
		asked(laptopDevice),
	)

	synced := b.sync(t, b.agent())
	if len(synced.Keys) != 3 || len(synced.Pending) != 0 || !b.opens(phoneDevice) {
		t.Fatalf("synced = %+v\n%s", synced, b.authorized())
	}
}

func TestAnApprovalThatDoesNotHoldLeavesTheKeyPending(t *testing.T) {
	stranger := newDevice(9)

	cases := map[string]func(t *testing.T, b *bench) contract.AgentStateKey{
		"for another server": func(t *testing.T, b *bench) contract.AgentStateKey {
			return asked(desktopDevice, laptopDevice.approvesOn(t, otherServer, desktopDevice, b.now))
		},
		"for another user": func(t *testing.T, b *bench) contract.AgentStateKey {
			entry := asked(desktopDevice, laptopDevice.approves(t, desktopDevice, b.now))
			entry.UserID = "someone-else"

			return entry
		},
		"signed by a key the server does not trust": func(t *testing.T, b *bench) contract.AgentStateKey {
			return asked(desktopDevice, stranger.approves(t, desktopDevice, b.now))
		},
		"too old": func(t *testing.T, b *bench) contract.AgentStateKey {
			return asked(desktopDevice, laptopDevice.approves(t, desktopDevice, b.now.Add(-8*24*time.Hour)))
		},
		"from the future": func(t *testing.T, b *bench) contract.AgentStateKey {
			return asked(desktopDevice, laptopDevice.approves(t, desktopDevice, b.now.Add(10*time.Minute)))
		},
		"for another key": func(t *testing.T, b *bench) contract.AgentStateKey {
			return asked(desktopDevice, laptopDevice.approves(t, phoneDevice, b.now))
		},
	}

	for name, entry := range cases {
		t.Run(name, func(t *testing.T) {
			b := newBench(t, true)
			b.trusting(t, laptopDevice)
			b.platform.want(asked(laptopDevice), entry(t, b))

			synced := b.sync(t, b.agent())
			if b.opens(desktopDevice) || len(synced.Pending) != 1 || b.trust(t).Trusts(desktopDevice.fingerprint(t)) {
				t.Fatalf("synced = %+v\n%s", synced, b.authorized())
			}
		})
	}
}

func TestApprovalsAreCheckedAgainstTheStoredServerID(t *testing.T) {
	b := newBench(t, true)
	b.trusting(t, laptopDevice)
	platform.SaveServerID(b.fake, "", otherServer)

	b.platform.want(asked(laptopDevice), asked(desktopDevice, laptopDevice.approves(t, desktopDevice, b.now)))

	synced := b.sync(t, b.agent())
	if b.opens(desktopDevice) || len(synced.Pending) != 1 {
		t.Fatalf("synced = %+v", synced)
	}

	if platform.LoadServerID(b.fake, "") != otherServer || !strings.Contains(b.journal(), "otherwise") {
		t.Fatalf("the stored id moved:\n%s", b.journal())
	}
}

func TestAKeyThePlatformStopsAskingForLeavesTheServer(t *testing.T) {
	b := newBench(t, true)
	b.trusting(t, laptopDevice, desktopDevice)
	agent := b.agent()

	b.platform.want(asked(laptopDevice))
	synced := b.sync(t, agent)
	if !synced.KeysChanged || b.opens(desktopDevice) || !b.opens(laptopDevice) || !strings.Contains(b.authorized(), own) {
		t.Fatalf("authorized_keys:\n%s", b.authorized())
	}

	trust := b.trust(t)
	if trust.Trusts(desktopDevice.fingerprint(t)) {
		t.Fatal("a removed key is still trusted")
	}

	if at, gone := trust.RemovedAt(desktopDevice.fingerprint(t)); !gone || !at.Equal(b.now) {
		t.Fatalf("removal %s, %v", at, gone)
	}

	b.platform.want(asked(laptopDevice), asked(desktopDevice, laptopDevice.approves(t, desktopDevice, b.now.Add(-time.Minute))))
	if b.sync(t, agent); b.opens(desktopDevice) {
		t.Fatal("an approval older than the removal brought the key back")
	}

	b.now = b.now.Add(time.Hour)
	b.platform.want(asked(laptopDevice), asked(desktopDevice, laptopDevice.approves(t, desktopDevice, b.now)))
	if b.sync(t, agent); !b.opens(desktopDevice) {
		t.Fatal("an approval issued after the removal is refused")
	}
}

func TestTheLastKeyIsNeverRemoved(t *testing.T) {
	b := newBench(t, true)
	b.trusting(t, laptopDevice)
	before, signersBefore := b.authorized(), string(b.fake.Files[keys.DefaultSignersPath])
	agent := b.agent()

	for _, entries := range [][]contract.AgentStateKey{nil, {asked(desktopDevice)}} {
		b.platform.want(entries...)

		synced := b.sync(t, agent)
		if synced.KeysChanged || b.authorized() != before || string(b.fake.Files[keys.DefaultSignersPath]) != signersBefore {
			t.Fatalf("with %d key(s) asked for:\n%s", len(entries), b.authorized())
		}
	}

	if !strings.Contains(b.journal(), "last key is never removed") {
		t.Fatalf("the journal must say why:\n%s", b.journal())
	}
}

func TestAPlatformThatNamesNoKeysMovesNothing(t *testing.T) {
	b := newBench(t, true)
	b.trusting(t, laptopDevice)
	before := b.authorized()
	b.platform.allow(desktopDevice.line)

	agent := b.agent()
	b.sync(t, agent)
	b.sync(t, agent)

	if b.authorized() != before {
		t.Fatalf("authorized_keys:\n%s", b.authorized())
	}

	if strings.Count(b.journal(), "names no keys") != 1 {
		t.Fatalf("said once, not every thirty seconds:\n%s", b.journal())
	}

	if err := agent.Beat(context.Background()); err != nil || b.platform.heartbeats()[0].Keys != nil {
		t.Fatal("a heartbeat speaks of keys no state has named")
	}
}

func TestAKeyWithOptionsOrOfAnotherTypeIsIgnored(t *testing.T) {
	b := newBench(t, true)
	b.trusting(t, laptopDevice)

	withOptions := asked(desktopDevice, laptopDevice.approves(t, desktopDevice, b.now))
	withOptions.PublicKey = `command="/bin/sh" ` + desktopDevice.line
	rsa := asked(desktopDevice)
	rsa.PublicKey = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7"
	commented := asked(desktopDevice)
	commented.PublicKey = desktopDevice.line + " jordan@desktop"

	b.platform.want(asked(laptopDevice), withOptions, rsa, commented)

	synced := b.sync(t, b.agent())
	if len(synced.Keys) != 1 || len(synced.Pending) != 0 || strings.Contains(b.authorized(), "command=") || b.opens(desktopDevice) {
		t.Fatalf("synced = %+v\n%s", synced, b.authorized())
	}

	if strings.Count(b.journal(), "key ignored") != 3 {
		t.Fatalf("journal:\n%s", b.journal())
	}
}

func TestAKeptKeyKeepsItsCommentAndLosesItsOptions(t *testing.T) {
	b := newBench(t, true)
	b.trusting(t, laptopDevice, desktopDevice)
	ctx := modtest.NewSysContext(b.fake)
	keys.Sync(ctx, keys.Target{Path: keys.DefaultPath}, []keys.Key{
		{Type: "ssh-ed25519", Blob: laptopDevice.key(t).Blob, Comment: "jordan@laptop"},
		{Options: `command="true"`, Type: "ssh-ed25519", Blob: desktopDevice.key(t).Blob},
	})

	b.platform.want(asked(laptopDevice), asked(desktopDevice))
	b.sync(t, b.agent())

	if !strings.Contains(b.authorized(), laptopDevice.line+" jordan@laptop") || strings.Contains(b.authorized(), "command=") || !b.opens(desktopDevice) {
		t.Fatalf("authorized_keys:\n%s", b.authorized())
	}
}

func TestKeysListReadsTheBlockWithItsFingerprints(t *testing.T) {
	b := newBench(t, true)
	b.trusting(t, laptopDevice, desktopDevice)
	b.platform.want(asked(laptopDevice), asked(desktopDevice))

	agent := b.agent()
	b.sync(t, agent)

	listed := agent.Keys()
	if len(listed) != 2 {
		t.Fatalf("block = %v", listed)
	}

	for _, key := range listed {
		if !strings.HasPrefix(key.Fingerprint(), "SHA256:") {
			t.Errorf("fingerprint = %q", key.Fingerprint())
		}
	}

	if !agent.SyncedAt().Equal(noon) {
		t.Fatalf("SyncedAt = %s", agent.SyncedAt())
	}
}

func TestSyncRefusesWithoutAServerToken(t *testing.T) {
	b := newBench(t, false)

	if _, err := b.agent().Sync(context.Background()); err != platform.ErrNoToken {
		t.Fatalf("err = %v", err)
	}

	if strings.Contains(b.authorized(), "pupitre") {
		t.Fatalf("a block was written without a token:\n%s", b.authorized())
	}
}

func TestARevokedServerTokenSuspendsTheEntitlementAndKeepsTheKeys(t *testing.T) {
	b := newBench(t, true)
	b.trusting(t, laptopDevice)
	b.platform.want(asked(laptopDevice))
	agent := b.agent()
	b.sync(t, agent)

	b.platform.suspend(http.StatusUnauthorized)

	if _, err := agent.Sync(context.Background()); err == nil {
		t.Fatal("a refused token should surface")
	}

	if !b.opens(laptopDevice) || !strings.Contains(b.authorized(), own) {
		t.Fatalf("the keys must stay:\n%s", b.authorized())
	}

	if got := b.recorded(); got != contract.EntitlementRestricted {
		t.Fatalf("the entitlement must be suspended on the spot, got %s", got)
	}

	if !strings.Contains(b.journal(), "revoked") {
		t.Fatalf("the journal must say why:\n%s", b.journal())
	}
}

func TestANetworkFailureLeavesTheKeysAndTheEntitlementInPlace(t *testing.T) {
	b := newBench(t, true)
	b.trusting(t, laptopDevice)
	b.platform.want(asked(laptopDevice))
	agent := b.agent()
	b.sync(t, agent)

	b.server.Close()

	if _, err := agent.Sync(context.Background()); err == nil {
		t.Fatal("a platform out of reach should surface")
	}

	if !b.opens(laptopDevice) {
		t.Fatalf("the keys were dropped on a silence:\n%s", b.authorized())
	}

	if got := b.recorded(); got != contract.EntitlementValid {
		t.Fatalf("the last answer of the platform still holds, got %s", got)
	}
}

func TestARefusalWithoutTheTokenCodeIsNotARevocation(t *testing.T) {
	b := newBench(t, true)
	b.platform.want()
	agent := b.agent()
	b.sync(t, agent)

	b.platform.refuseWith(http.StatusUnauthorized, "unauthenticated")

	if _, err := agent.Sync(context.Background()); err == nil {
		t.Fatal("a refusal should surface")
	}

	if got := b.recorded(); got != contract.EntitlementValid {
		t.Fatalf("the entitlement moved on a refusal that names no token, got %s", got)
	}
}

func TestARefusalOnATokenThatWasJustRotatedIsNotARevocation(t *testing.T) {
	b := newBench(t, true)
	b.platform.want()
	agent := b.agent()
	b.sync(t, agent)

	b.platform.refused = func() { b.fake.Files[platform.DefaultTokenPath] = []byte("jeton-tout-neuf\n") }
	b.platform.suspend(http.StatusUnauthorized)

	if _, err := agent.Sync(context.Background()); err == nil {
		t.Fatal("a refusal should surface")
	}

	if got := b.recorded(); got != contract.EntitlementValid {
		t.Fatalf("the entitlement must not move during a rotation, got %s", got)
	}
}

func TestBeatSendsWhatTheMachineIs(t *testing.T) {
	b := newBench(t, true)

	if err := b.agent().Beat(context.Background()); err != nil {
		t.Fatalf("Beat: %v", err)
	}

	beats := b.platform.heartbeats()
	if len(beats) != 1 {
		t.Fatalf("%d heartbeat(s)", len(beats))
	}

	beat := beats[0]
	if beat.AgentVersion != "1.2.3" || beat.StackVersion != "1.2.3" {
		t.Fatalf("beat = %+v", beat)
	}
	if beat.SSHUser != daemon.DefaultKeysOwner {
		t.Fatalf("the heartbeat must name the account whose keys the agent holds, got %q", beat.SSHUser)
	}
}

func TestEnrollTradesTheTokenAndWritesTheServerToken(t *testing.T) {
	b := newBench(t, false)

	if err := b.agent().Enroll(context.Background(), " jeton-d-enrolement \n", ""); err != nil {
		t.Fatalf("Enroll: %v", err)
	}

	if len(b.platform.traded) != 1 {
		t.Fatalf("%d exchange(s)", len(b.platform.traded))
	}

	traded := b.platform.traded[0]
	if traded.Token != "jeton-d-enrolement" || traded.HostPublicKey != hostKey || traded.Arch != "amd64" {
		t.Fatalf("traded %+v", traded)
	}

	token, err := platform.LoadToken(b.fake, platform.DefaultTokenPath)
	if err != nil || token != "jeton-de-serveur" {
		t.Fatalf("token = %q, err = %v", token, err)
	}
}

func TestEnrollLetsTheNextReadNameTheServerAnew(t *testing.T) {
	b := newBench(t, true)
	platform.SaveServerID(b.fake, "", otherServer)
	agent := b.agent()

	if err := agent.Enroll(context.Background(), "jeton-d-enrolement", b.server.URL); err != nil {
		t.Fatalf("Enroll: %v", err)
	}

	if stored := platform.LoadServerID(b.fake, ""); stored != "" {
		t.Fatalf("the id of before is kept: %q", stored)
	}

	b.platform.want()
	b.sync(t, agent)

	if stored := platform.LoadServerID(b.fake, ""); stored != serverID {
		t.Fatalf("stored = %q", stored)
	}
}

func TestEnrollWritesThePlatformItTradedWithBeforeTheToken(t *testing.T) {
	b := newBench(t, false)
	console := b.server.URL

	if err := b.agent().Enroll(context.Background(), "jeton-d-enrolement", console); err != nil {
		t.Fatalf("Enroll: %v", err)
	}

	if kept := platform.LoadBaseURL(b.fake, platform.DefaultBaseURLPath); kept != console {
		t.Fatalf("platform kept = %q, want %q", kept, console)
	}

	writes := strings.Join(b.fake.Mutations, "\n")
	url, token := strings.Index(writes, "write "+platform.DefaultBaseURLPath), strings.Index(writes, "write "+platform.DefaultTokenPath)
	if url < 0 || token < 0 || url > token {
		t.Fatalf("the platform must be written before the token:\n%s", writes)
	}
}

func TestTheUnitConfinesTheDaemon(t *testing.T) {
	for _, directive := range []string{
		"ProtectSystem=strict",
		"StateDirectory=pupitre",
		"ReadWritePaths=/var/log /home/dev/.ssh -/etc/pupitre",
		"ProtectKernelTunables=true",
		"RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX",
		"NoNewPrivileges=true",
		"PrivateTmp=true",
	} {
		if !strings.Contains(daemon.UnitFile, directive+"\n") {
			t.Errorf("the unit lacks %s", directive)
		}
	}
}

func TestAnEnrolmentThatNamesNoPlatformWritesNone(t *testing.T) {
	b := newBench(t, false)

	if err := b.agent().Enroll(context.Background(), "jeton-d-enrolement", ""); err != nil {
		t.Fatalf("Enroll: %v", err)
	}

	if kept := platform.LoadBaseURL(b.fake, platform.DefaultBaseURLPath); kept != "" {
		t.Fatalf("nothing was named, %q was kept", kept)
	}
}

func TestEnrollRefusesAnEmptyTokenAndAnUnreadableHostKey(t *testing.T) {
	b := newBench(t, false)

	if err := b.agent().Enroll(context.Background(), "  \n", ""); err == nil {
		t.Fatal("an empty token was exchanged")
	}

	delete(b.fake.Files, daemon.DefaultHostKeyPath)
	if err := b.agent().Enroll(context.Background(), "jeton", ""); err == nil || !strings.Contains(err.Error(), "host key") {
		t.Fatalf("err = %v", err)
	}
}

func TestRunPollsUntilItIsStopped(t *testing.T) {
	b := newBench(t, true)
	b.trusting(t, laptopDevice)
	b.platform.want(asked(laptopDevice))

	ctx, stop := context.WithCancel(context.Background())
	defer stop()

	agent := daemon.New(daemon.Options{
		Sys:               b.fake,
		Now:               func() time.Time { return b.now },
		Platform:          platform.Client{BaseURL: b.server.URL},
		Entitlement:       entitlement.New(entitlement.Options{Sys: b.fake, Now: func() time.Time { return b.now }}),
		AgentVersion:      "1.2.3",
		StateInterval:     time.Millisecond,
		HeartbeatInterval: time.Millisecond,
	})

	done := make(chan error, 1)
	go func() { done <- agent.Run(ctx) }()

	deadline := time.After(5 * time.Second)
	for b.platform.count() < 3 {
		select {
		case <-deadline:
			t.Fatalf("%d state read(s) in five seconds", b.platform.count())
		default:
			time.Sleep(time.Millisecond)
		}
	}

	b.platform.suspend(http.StatusUnauthorized)
	time.Sleep(10 * time.Millisecond)

	stop()
	if err := <-done; err != nil {
		t.Fatalf("Run: %v", err)
	}

	if !b.opens(laptopDevice) || !strings.Contains(b.authorized(), own) {
		t.Fatalf("a revoked server keeps its keys:\n%s", b.authorized())
	}
}

func TestUpkeepWaitsOutABusyEngineThenRunsNoMore(t *testing.T) {
	b := newBench(t, true)
	b.trusting(t, laptopDevice)
	b.platform.want(asked(laptopDevice))

	var calls atomic.Int32

	upkeep := func() error {
		if calls.Add(1) < 3 {
			return protocol.NewError(contract.ErrorBusy, "an install is under way")
		}

		return nil
	}

	ctx, stop := context.WithCancel(context.Background())
	defer stop()

	agent := daemon.New(daemon.Options{
		Sys:               b.fake,
		Now:               func() time.Time { return b.now },
		Platform:          platform.Client{BaseURL: b.server.URL},
		Entitlement:       entitlement.New(entitlement.Options{Sys: b.fake, Now: func() time.Time { return b.now }}),
		AgentVersion:      "1.2.3",
		StateInterval:     time.Millisecond,
		HeartbeatInterval: time.Millisecond,
		Upkeep:            upkeep,
	})

	done := make(chan error, 1)
	go func() { done <- agent.Run(ctx) }()

	deadline := time.After(5 * time.Second)
	for b.platform.count() < 10 {
		select {
		case <-deadline:
			t.Fatalf("%d state read(s) in five seconds", b.platform.count())
		default:
			time.Sleep(time.Millisecond)
		}
	}

	stop()
	if err := <-done; err != nil {
		t.Fatalf("Run: %v", err)
	}

	if got := calls.Load(); got != 3 {
		t.Fatalf("upkeep ran %d time(s), want twice busy then once through", got)
	}
}

func TestParsedKeysKeepTheirComment(t *testing.T) {
	parsed, refused := keys.ParseAll([]string{laptop})

	if len(refused) != 0 || parsed[0].Comment != "jordan@laptop" {
		t.Fatalf("parsed = %+v, refused = %v", parsed, refused)
	}
}
