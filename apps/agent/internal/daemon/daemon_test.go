package daemon_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/daemon"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/keys"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/platform"
)

const (
	laptop  = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILykUfO8a7qKBQHbW/KSfnaTtl1nAJxVpOzifJBri1Hl jordan@laptop"
	desktop = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGb1YbGvDgQBGNPCsjkPu1FdQBcyRZY0ubmZmvUKpH+E jordan@desktop"
	own     = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFYbYqYFCzS+wnaB9G7NkFuFRPlBRbxJqcVJ0m8OvXKp secours"
	hostKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINPmg2sJ7wUW1eUeGGiuIYbYVWH8ihu5xMt/M39EO4Bd root@vps"
)

var noon = time.Date(2026, time.September, 4, 12, 0, 0, 0, time.UTC)

// A platform that answers /agent/state, /agent/exchange and /agent/heartbeat, and nothing that ever leaves this test.
type fakePlatform struct {
	mu sync.Mutex

	authorized []string
	state      string
	validUntil time.Time
	target     string
	refuse     int
	refuseCode string
	refused    func()

	echo bool

	states int
	beats  []platform.Heartbeat
	traded []platform.Enrollment
}

func newPlatform() *fakePlatform {
	return &fakePlatform{state: "valid", validUntil: noon.Add(24 * time.Hour), target: "1.4.0"}
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
			json.NewEncoder(w).Encode(map[string]any{
				"entitlement":     p.state,
				"valid_until":     p.validUntil,
				"authorized_keys": p.authorized,
				"target_version":  p.target,
				"hostname":        "vps",
			})
		case "/agent/heartbeat":
			var beat platform.Heartbeat
			json.NewDecoder(r.Body).Decode(&beat)
			p.beats = append(p.beats, beat)
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

func (p *fakePlatform) allow(lines ...string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.authorized = lines
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

// A platform that hands the token it just received back in its refusal: the worst case the redaction exists for.
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

// A key added in the console opens the server on the very next read, thirty seconds later at worst.
func TestAKeyAddedInTheConsoleOpensTheServer(t *testing.T) {
	b := newBench(t, true)
	b.platform.allow(laptop)

	synced, err := b.agent().Sync(context.Background())
	if err != nil {
		t.Fatalf("Sync: %v", err)
	}

	if !synced.KeysChanged || len(synced.Keys) != 1 || synced.TargetVersion != "1.4.0" {
		t.Fatalf("synced = %+v", synced)
	}

	if !strings.Contains(b.authorized(), laptop) || !strings.Contains(b.authorized(), own) {
		t.Fatalf("authorized_keys :\n%s", b.authorized())
	}

	if synced.Entitlement == contract.EntitlementRestricted {
		t.Fatalf("a read that just succeeded restricts the agent: %s", synced.Entitlement)
	}
}

// Withdrawn in the console, it stops opening it on the next read; nothing the client wrote himself moves.
func TestAKeyWithdrawnInTheConsoleClosesTheServer(t *testing.T) {
	b := newBench(t, true)
	agent := b.agent()

	b.platform.allow(laptop, desktop)
	agent.Sync(context.Background())

	b.platform.allow(laptop)
	synced, err := agent.Sync(context.Background())
	if err != nil || !synced.KeysChanged {
		t.Fatalf("synced = %+v, err = %v", synced, err)
	}

	if strings.Contains(b.authorized(), desktop) {
		t.Fatalf("the removed key still opens:\n%s", b.authorized())
	}

	if !strings.Contains(b.authorized(), own) || !strings.Contains(b.authorized(), laptop) {
		t.Fatalf("authorized_keys :\n%s", b.authorized())
	}
}

func TestSyncIgnoresAKeyItCannotRead(t *testing.T) {
	b := newBench(t, true)
	b.platform.allow(laptop, "ssh-ed25519 broken")

	synced, err := b.agent().Sync(context.Background())
	if err != nil || len(synced.Keys) != 1 {
		t.Fatalf("synced = %+v, err = %v", synced, err)
	}

	if strings.Contains(b.authorized(), "broken") {
		t.Fatalf("authorized_keys :\n%s", b.authorized())
	}
}

func TestKeysListReadsTheBlockWithItsFingerprints(t *testing.T) {
	b := newBench(t, true)
	b.platform.allow(laptop, desktop)

	agent := b.agent()
	agent.Sync(context.Background())

	listed := agent.Keys()
	if len(listed) != 2 {
		t.Fatalf("bloc = %v", listed)
	}

	for _, key := range listed {
		if !strings.HasPrefix(key.Fingerprint(), "SHA256:") {
			t.Errorf("empreinte = %q", key.Fingerprint())
		}
	}

	if !agent.SyncedAt().Equal(noon) {
		t.Fatalf("SyncedAt = %s", agent.SyncedAt())
	}
}

func TestSyncRefusesWithoutAServerToken(t *testing.T) {
	b := newBench(t, false)

	if _, err := b.agent().Sync(context.Background()); err != platform.ErrNoToken {
		t.Fatalf("erreur = %v", err)
	}

	if strings.Contains(b.authorized(), "pupitre") {
		t.Fatalf("a block was written without a token:\n%s", b.authorized())
	}
}

// A server the platform no longer knows — revoked, purged — loses its keys at once and its entitlement with them: the console said so, and the keys fall on the spot.
func TestARevokedServerTokenClosesTheKeysAndSuspendsTheEntitlement(t *testing.T) {
	b := newBench(t, true)
	b.platform.allow(laptop)
	agent := b.agent()
	agent.Sync(context.Background())

	b.platform.suspend(http.StatusUnauthorized)

	if _, err := agent.Sync(context.Background()); err == nil {
		t.Fatal("a refused token should surface")
	}

	if strings.Contains(b.authorized(), laptop) || !strings.Contains(b.authorized(), own) {
		t.Fatalf("the platform's keys must be withdrawn, and the client's own kept:\n%s", b.authorized())
	}

	if got := agent.Entitlement(); got != contract.EntitlementRestricted {
		t.Fatalf("the entitlement must be suspended on the spot, got %s", got)
	}

	if !strings.Contains(b.journal(), "revoked") {
		t.Fatalf("the journal must say why:\n%s", b.journal())
	}
}

// A platform out of reach is a silence, not a revocation: the keys stay, and the tolerance is what closes the agent.
func TestANetworkFailureLeavesTheKeysAndTheEntitlementInPlace(t *testing.T) {
	b := newBench(t, true)
	b.platform.allow(laptop)
	agent := b.agent()
	agent.Sync(context.Background())

	b.server.Close()

	if _, err := agent.Sync(context.Background()); err == nil {
		t.Fatal("a platform out of reach should surface")
	}

	if !strings.Contains(b.authorized(), laptop) {
		t.Fatalf("the keys were dropped on a silence:\n%s", b.authorized())
	}

	if got := agent.Entitlement(); got != contract.EntitlementValid {
		t.Fatalf("the last answer of the platform still holds, got %s", got)
	}
}

// A 401 that does not name the token — a proxy, a platform mid-deploy — is a silence too.
func TestARefusalWithoutTheTokenCodeLeavesTheKeysInPlace(t *testing.T) {
	b := newBench(t, true)
	b.platform.allow(laptop)
	agent := b.agent()
	agent.Sync(context.Background())

	b.platform.refuseWith(http.StatusUnauthorized, "unauthenticated")

	if _, err := agent.Sync(context.Background()); err == nil {
		t.Fatal("a refusal should surface")
	}

	if !strings.Contains(b.authorized(), laptop) {
		t.Fatalf("the keys were dropped on a refusal that names no token:\n%s", b.authorized())
	}
}

// A token traded for a fresh one while the read was in flight is not a revocation: the refusal was for the token that just left the disk.
func TestARefusalOnATokenThatWasJustRotatedIsNotARevocation(t *testing.T) {
	b := newBench(t, true)
	b.platform.allow(laptop)
	agent := b.agent()
	agent.Sync(context.Background())

	b.platform.refused = func() { b.fake.Files[platform.DefaultTokenPath] = []byte("jeton-tout-neuf\n") }
	b.platform.suspend(http.StatusUnauthorized)

	if _, err := agent.Sync(context.Background()); err == nil {
		t.Fatal("a refusal should surface")
	}

	if !strings.Contains(b.authorized(), laptop) {
		t.Fatalf("the keys were dropped during a rotation:\n%s", b.authorized())
	}

	if got := agent.Entitlement(); got != contract.EntitlementValid {
		t.Fatalf("the entitlement must not move during a rotation, got %s", got)
	}
}

func TestBeatSendsWhatTheMachineIs(t *testing.T) {
	b := newBench(t, true)

	if err := b.agent().Beat(context.Background()); err != nil {
		t.Fatalf("Beat: %v", err)
	}

	if len(b.platform.beats) != 1 {
		t.Fatalf("%d heartbeat(s)", len(b.platform.beats))
	}

	beat := b.platform.beats[0]
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
		t.Fatalf("jeton = %q, err = %v", token, err)
	}
}

// The heartbeat and the entitlement run without the app: the only thing that
// can tell them which platform to answer is what the enrolment wrote down, so
// it lands before the token does.
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
		"ReadWritePaths=/var/log /home/dev/.ssh",
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
		t.Fatalf("erreur = %v", err)
	}
}

// The loop reads the state and beats on its own; a platform out of reach never stops it.
func TestRunPollsUntilItIsStopped(t *testing.T) {
	b := newBench(t, true)
	b.platform.allow(laptop)

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

	if strings.Contains(b.authorized(), laptop) || !strings.Contains(b.authorized(), own) {
		t.Fatalf("a revoked server loses the platform's keys and keeps its own:\n%s", b.authorized())
	}
}

func TestParsedKeysKeepTheirComment(t *testing.T) {
	parsed, refused := keys.ParseAll([]string{laptop})

	if len(refused) != 0 || parsed[0].Comment != "jordan@laptop" {
		t.Fatalf("parsed = %+v, refused = %v", parsed, refused)
	}
}
