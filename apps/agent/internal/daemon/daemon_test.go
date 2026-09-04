package daemon_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
			w.WriteHeader(p.refuse)
			w.Write([]byte(`{"error":{"code":"invalid_server_token","message":"jeton inconnu"}}`))

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
				"module_params":   map[string]any{},
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
	p.mu.Lock()
	defer p.mu.Unlock()

	p.refuse = status
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
}

func newBench(t *testing.T, enrolled bool) *bench {
	t.Helper()

	fake := modtest.NewFakeSys()
	fake.Files[daemon.DefaultKeysPath] = []byte(own + "\n")
	fake.Files[daemon.DefaultHostKeyPath] = []byte(hostKey + "\n")
	if enrolled {
		fake.Files[platform.DefaultTokenPath] = []byte("jeton-de-serveur\n")
	}

	b := &bench{fake: fake, platform: newPlatform(), now: noon}
	b.server = b.platform.serve()
	t.Cleanup(b.server.Close)

	return b
}

func (b *bench) agent() *daemon.Daemon {
	now := func() time.Time { return b.now }

	return daemon.New(daemon.Options{
		Sys:          b.fake,
		Now:          now,
		Platform:     platform.Client{BaseURL: b.server.URL},
		Entitlement:  entitlement.New(entitlement.Options{Sys: b.fake, Now: now}),
		AgentVersion: "1.2.3",
		Arch:         "amd64",
	})
}

func (b *bench) authorized() string {
	return string(b.fake.Files[daemon.DefaultKeysPath])
}

// A key added in the console opens the server on the very next read, thirty seconds later at worst.
func TestAKeyAddedInTheConsoleOpensTheServer(t *testing.T) {
	b := newBench(t, true)
	b.platform.allow(laptop)

	synced, err := b.agent().Sync()
	if err != nil {
		t.Fatalf("Sync: %v", err)
	}

	if !synced.KeysChanged || len(synced.Keys) != 1 || synced.TargetVersion != "1.4.0" {
		t.Fatalf("synced = %+v", synced)
	}

	if !strings.Contains(b.authorized(), laptop) || !strings.Contains(b.authorized(), own) {
		t.Fatalf("authorized_keys :\n%s", b.authorized())
	}

	if synced.Entitlement != contract.EntitlementValid {
		t.Fatalf("droit d'usage = %s", synced.Entitlement)
	}
}

// Withdrawn in the console, it stops opening it on the next read; nothing the client wrote himself moves.
func TestAKeyWithdrawnInTheConsoleClosesTheServer(t *testing.T) {
	b := newBench(t, true)
	agent := b.agent()

	b.platform.allow(laptop, desktop)
	agent.Sync()

	b.platform.allow(laptop)
	synced, err := agent.Sync()
	if err != nil || !synced.KeysChanged {
		t.Fatalf("synced = %+v, err = %v", synced, err)
	}

	if strings.Contains(b.authorized(), desktop) {
		t.Fatalf("la clé retirée ouvre encore :\n%s", b.authorized())
	}

	if !strings.Contains(b.authorized(), own) || !strings.Contains(b.authorized(), laptop) {
		t.Fatalf("authorized_keys :\n%s", b.authorized())
	}
}

func TestSyncIgnoresAKeyItCannotRead(t *testing.T) {
	b := newBench(t, true)
	b.platform.allow(laptop, "ssh-ed25519 cassée")

	synced, err := b.agent().Sync()
	if err != nil || len(synced.Keys) != 1 {
		t.Fatalf("synced = %+v, err = %v", synced, err)
	}

	if strings.Contains(b.authorized(), "cassée") {
		t.Fatalf("authorized_keys :\n%s", b.authorized())
	}
}

func TestKeysListReadsTheBlockWithItsFingerprints(t *testing.T) {
	b := newBench(t, true)
	b.platform.allow(laptop, desktop)

	agent := b.agent()
	agent.Sync()

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

	if _, err := b.agent().Sync(); err != platform.ErrNoToken {
		t.Fatalf("erreur = %v", err)
	}

	if strings.Contains(b.authorized(), "pupitre") {
		t.Fatalf("un bloc a été écrit sans jeton :\n%s", b.authorized())
	}
}

// A revoked token leaves the machine as it stands: the tolerance is what closes the agent, not a refusal on the wire.
func TestARefusedTokenLeavesTheKeysInPlace(t *testing.T) {
	b := newBench(t, true)
	b.platform.allow(laptop)
	agent := b.agent()
	agent.Sync()

	b.platform.suspend(http.StatusUnauthorized)

	if _, err := agent.Sync(); err == nil {
		t.Fatal("un jeton refusé devrait remonter")
	}

	if !strings.Contains(b.authorized(), laptop) {
		t.Fatalf("les clés ont sauté sur un refus :\n%s", b.authorized())
	}
}

func TestBeatSendsWhatTheMachineIs(t *testing.T) {
	b := newBench(t, true)

	if err := b.agent().Beat(); err != nil {
		t.Fatalf("Beat: %v", err)
	}

	if len(b.platform.beats) != 1 {
		t.Fatalf("%d heartbeat(s)", len(b.platform.beats))
	}

	beat := b.platform.beats[0]
	if beat.AgentVersion != "1.2.3" || beat.StackVersion != "1.2.3" {
		t.Fatalf("beat = %+v", beat)
	}
}

func TestEnrollTradesTheTokenAndWritesTheServerToken(t *testing.T) {
	b := newBench(t, false)

	if err := b.agent().Enroll(" jeton-d-enrolement \n"); err != nil {
		t.Fatalf("Enroll: %v", err)
	}

	if len(b.platform.traded) != 1 {
		t.Fatalf("%d échange(s)", len(b.platform.traded))
	}

	traded := b.platform.traded[0]
	if traded.Token != "jeton-d-enrolement" || traded.HostPublicKey != hostKey || traded.Arch != "amd64" {
		t.Fatalf("échangé %+v", traded)
	}

	token, err := platform.LoadToken(b.fake, platform.DefaultTokenPath)
	if err != nil || token != "jeton-de-serveur" {
		t.Fatalf("jeton = %q, err = %v", token, err)
	}
}

func TestEnrollRefusesAnEmptyTokenAndAnUnreadableHostKey(t *testing.T) {
	b := newBench(t, false)

	if err := b.agent().Enroll("  \n"); err == nil {
		t.Fatal("un jeton vide a été échangé")
	}

	delete(b.fake.Files, daemon.DefaultHostKeyPath)
	if err := b.agent().Enroll("jeton"); err == nil || !strings.Contains(err.Error(), "clé d'hôte") {
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
			t.Fatalf("%d lecture(s) d'état en cinq secondes", b.platform.count())
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

	if !strings.Contains(b.authorized(), laptop) {
		t.Fatalf("authorized_keys :\n%s", b.authorized())
	}
}

func TestParsedKeysKeepTheirComment(t *testing.T) {
	parsed, refused := keys.ParseAll([]string{laptop})

	if len(refused) != 0 || parsed[0].Comment != "jordan@laptop" {
		t.Fatalf("parsed = %+v, refused = %v", parsed, refused)
	}
}
