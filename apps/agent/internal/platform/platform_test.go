package platform_test

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/platform"
)

func TestReleaseCarriesTheServerToken(t *testing.T) {
	var seen string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = r.Header.Get("Authorization")
		w.Write([]byte("ELF"))
	}))
	defer server.Close()

	body, err := platform.Client{BaseURL: server.URL, Token: "jeton"}.Release(context.Background(), "1.2.3")
	if err != nil {
		t.Fatalf("Release: %v", err)
	}

	if string(body) != "ELF" || seen != "Bearer jeton" {
		t.Fatalf("body %q, header %q", body, seen)
	}
}

func TestEveryCallSaysWhichAgentMakesIt(t *testing.T) {
	var seen string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = r.Header.Get("User-Agent")
	}))
	defer server.Close()

	if _, err := (platform.Client{BaseURL: server.URL, Token: "jeton", Version: "1.4.0"}).Release(context.Background(), "1.2.3"); err != nil {
		t.Fatalf("Release: %v", err)
	}

	if seen != "pupitred/1.4.0" {
		t.Fatalf("User-Agent = %q", seen)
	}
}

func TestACancelledContextStopsTheCall(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := (platform.Client{BaseURL: server.URL, Token: "jeton"}).State(ctx); err == nil || !errors.Is(err, context.Canceled) {
		t.Fatalf("got %v, want the cancellation", err)
	}
}

// The platform is only ever spoken to over a modern TLS: a downgraded handshake is refused before any token leaves.
func TestTheClientRefusesATlsBelowOneDotTwo(t *testing.T) {
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	server.TLS = &tls.Config{MaxVersion: tls.VersionTLS11}
	server.StartTLS()
	defer server.Close()

	_, err := platform.Client{BaseURL: server.URL, Token: "jeton"}.State(context.Background())
	if err == nil || !strings.Contains(err.Error(), "protocol version") {
		t.Fatalf("got %v, want a refused handshake", err)
	}
}

func TestReleaseAsksForTheVersionOfTheRequest(t *testing.T) {
	var path string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
	}))
	defer server.Close()

	if _, err := (platform.Client{BaseURL: server.URL + "/api/v1", Token: "jeton"}).Release(context.Background(), "1.2.3"); err != nil {
		t.Fatalf("Release: %v", err)
	}

	if path != "/api/v1/agent/release/1.2.3" {
		t.Fatalf("requested path: %s", path)
	}
}

// The platform answers 303 towards a signed storage URL; the token stops at the platform.
func TestReleaseFollowsTheRedirectWithoutLeakingTheToken(t *testing.T) {
	storage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" {
			t.Errorf("the token followed the redirect: %s", r.Header.Get("Authorization"))
		}
		w.Write([]byte("signed binary"))
	}))
	defer storage.Close()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, storage.URL+"/pupitred", http.StatusSeeOther)
	}))
	defer server.Close()

	body, err := platform.Client{BaseURL: server.URL, Token: "jeton"}.Release(context.Background(), "1.2.3")
	if err != nil {
		t.Fatalf("Release: %v", err)
	}

	if string(body) != "signed binary" {
		t.Fatalf("body: %q", body)
	}
}

func TestReleaseTellsAnUnknownVersionApartFromAFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	_, err := platform.Client{BaseURL: server.URL, Token: "jeton"}.Release(context.Background(), "9.9.9")

	var failure *platform.Error
	if !errors.As(err, &failure) || !failure.NotFound() {
		t.Fatalf("error = %v", err)
	}
}

func TestReleaseRefusesABodyBeyondTheCap(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte(strings.Repeat("x", 64)))
	}))
	defer server.Close()

	_, err := platform.Client{BaseURL: server.URL, Token: "jeton", MaxBytes: 16}.Release(context.Background(), "1.2.3")
	if err == nil || !strings.Contains(err.Error(), "beyond 16 bytes") {
		t.Fatalf("error = %v", err)
	}
}

func TestClientRefusesAPlaintextPlatform(t *testing.T) {
	_, err := platform.Client{BaseURL: "http://pupitre.example", Token: "jeton"}.Release(context.Background(), "1.2.3")
	if err == nil || !strings.Contains(err.Error(), "plaintext platform address") {
		t.Fatalf("error = %v", err)
	}
}

func TestClientRefusesToCallWithoutAToken(t *testing.T) {
	_, err := platform.Client{BaseURL: "https://pupitre.example"}.Release(context.Background(), "1.2.3")
	if err == nil || !strings.Contains(err.Error(), "no server token") {
		t.Fatalf("error = %v", err)
	}
}

func TestLoadTokenRefusesAnEmptyFile(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files["/etc/pupitre/server.token"] = []byte("  \n")

	if _, err := platform.LoadToken(fake, "/etc/pupitre/server.token"); !errors.Is(err, platform.ErrNoToken) {
		t.Fatalf("error = %v", err)
	}
}

func TestLoadTokenTrimsTheFile(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files["/etc/pupitre/server.token"] = []byte("jeton-de-serveur\n")

	token, err := platform.LoadToken(fake, "/etc/pupitre/server.token")
	if err != nil || token != "jeton-de-serveur" {
		t.Fatalf("token = %q, err = %v", token, err)
	}
}

func TestStateReadsEverythingTheAgentPolls(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/agent/state" || r.Method != http.MethodGet {
			t.Errorf("%s %s", r.Method, r.URL.Path)
		}
		w.Write([]byte(`{"entitlement":"grace","valid_until":"2026-09-05T12:00:00.000Z","authorized_keys":["ssh-ed25519 AAAA jordan@laptop"],"target_version":"1.4.0","hostname":"vps"}`))
	}))
	defer server.Close()

	state, err := platform.Client{BaseURL: server.URL, Token: "jeton"}.State(context.Background())
	if err != nil {
		t.Fatalf("State: %v", err)
	}

	if state.Entitlement != "grace" || state.TargetVersion != "1.4.0" || state.Hostname != "vps" {
		t.Fatalf("state = %+v", state)
	}

	if len(state.AuthorizedKeys) != 1 || !state.ValidUntil.Equal(time.Date(2026, time.September, 5, 12, 0, 0, 0, time.UTC)) {
		t.Fatalf("keys %v, valid until %s", state.AuthorizedKeys, state.ValidUntil)
	}
}

func TestStateCarriesTheVersionFloorOfTheServer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte(`{"entitlement":"valid","valid_until":"2026-09-05T12:00:00.000Z","authorized_keys":[],"target_version":"1.4.0","minimum_version":"1.2.0","hostname":"vps"}`))
	}))
	defer server.Close()

	state, err := platform.Client{BaseURL: server.URL, Token: "jeton"}.State(context.Background())
	if err != nil || state.MinimumVersion != "1.2.0" {
		t.Fatalf("state = %+v, err = %v", state, err)
	}
}

func TestReleaseMetadataReadsTheFingerprintAndTheSignature(t *testing.T) {
	var authorization string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/agent/release/1.4.0/metadata" || r.Method != http.MethodGet {
			t.Errorf("%s %s", r.Method, r.URL.Path)
		}
		authorization = r.Header.Get("Authorization")
		w.Write([]byte(`{"version":"1.4.0","arch":"amd64","sha256":"` + strings.Repeat("a", 64) + `","signature":"c2lnbmF0dXJl","channel":"stable"}`))
	}))
	defer server.Close()

	info, err := platform.Client{BaseURL: server.URL, Token: "jeton"}.ReleaseMetadata(context.Background(), "1.4.0")
	if err != nil {
		t.Fatalf("ReleaseMetadata: %v", err)
	}

	if info.Version != "1.4.0" || info.Arch != "amd64" || info.Signature != "c2lnbmF0dXJl" || info.SHA256 != strings.Repeat("a", 64) {
		t.Fatalf("info = %+v", info)
	}

	if authorization != "Bearer jeton" {
		t.Fatalf("authorization = %q", authorization)
	}
}

// Half an answer is no answer: an agent that took an empty signature for a valid one would install anything.
func TestReleaseMetadataRefusesAnAnswerWithoutASignature(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte(`{"version":"1.4.0","arch":"amd64","sha256":"","signature":"","channel":"stable"}`))
	}))
	defer server.Close()

	if _, err := (platform.Client{BaseURL: server.URL, Token: "jeton"}).ReleaseMetadata(context.Background(), "1.4.0"); err == nil {
		t.Fatal("empty metadata must be refused")
	}
}

// The platform leaves target_version null while no release is published for this architecture.
func TestStateAcceptsANullTargetVersion(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte(`{"entitlement":"valid","valid_until":"2026-09-05T12:00:00.000Z","authorized_keys":[],"target_version":null,"hostname":"vps"}`))
	}))
	defer server.Close()

	state, err := platform.Client{BaseURL: server.URL, Token: "jeton"}.State(context.Background())
	if err != nil || state.TargetVersion != "" {
		t.Fatalf("state = %+v, err = %v", state, err)
	}
}

func TestExchangeTradesTheEnrolmentTokenWithoutAServerToken(t *testing.T) {
	var seen platform.Enrollment
	var authorization string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/agent/exchange" || r.Method != http.MethodPost {
			t.Errorf("%s %s", r.Method, r.URL.Path)
		}
		authorization = r.Header.Get("Authorization")
		json.NewDecoder(r.Body).Decode(&seen)
		w.Write([]byte(`{"server_token":"jeton-de-serveur"}`))
	}))
	defer server.Close()

	token, err := platform.Client{BaseURL: server.URL}.Exchange(context.Background(), platform.Enrollment{
		Token:         "jeton-d-enrolement",
		HostPublicKey: "ssh-ed25519 AAAA root@vps",
		AgentVersion:  "1.2.3",
		Arch:          "amd64",
	})
	if err != nil || token != "jeton-de-serveur" {
		t.Fatalf("token = %q, err = %v", token, err)
	}

	if seen.Token != "jeton-d-enrolement" || seen.Arch != "amd64" || authorization != "" {
		t.Fatalf("sent %+v, header %q", seen, authorization)
	}
}

func TestExchangeCarriesTheRefusalOfThePlatform(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusConflict)
		w.Write([]byte(`{"error":{"code":"enrollment_used","message":"jeton déjà échangé"}}`))
	}))
	defer server.Close()

	_, err := platform.Client{BaseURL: server.URL}.Exchange(context.Background(), platform.Enrollment{Token: "x"})

	var failure *platform.Error
	if !errors.As(err, &failure) || failure.Code != "enrollment_used" || failure.Status != http.StatusConflict {
		t.Fatalf("error = %v", err)
	}

	if !strings.Contains(err.Error(), "jeton déjà échangé") {
		t.Fatalf("message = %q", err.Error())
	}
}

func TestBeatSendsTheSampleAndAcceptsAnEmptyAnswer(t *testing.T) {
	var body map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer jeton" {
			t.Errorf("header %q", r.Header.Get("Authorization"))
		}
		json.NewDecoder(r.Body).Decode(&body)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	err := platform.Client{BaseURL: server.URL, Token: "jeton"}.Beat(context.Background(), platform.Heartbeat{
		Disk: 41, RAM: 62, Load: 0.4, StackVersion: "1.2.3", AgentVersion: "1.2.3",
	})
	if err != nil {
		t.Fatalf("Beat: %v", err)
	}

	if body["disk"] != float64(41) || body["stack_version"] != "1.2.3" {
		t.Fatalf("body = %v", body)
	}

	// The contract types sessions and modules as arrays: an agent with neither still sends arrays.
	if _, ok := body["sessions"].([]any); !ok {
		t.Fatalf("sessions = %v", body["sessions"])
	}
	if _, ok := body["modules"].([]any); !ok {
		t.Fatalf("modules = %v", body["modules"])
	}
}

func TestBeatRefusesWithoutAToken(t *testing.T) {
	if err := (platform.Client{BaseURL: "https://pupitre.example"}).Beat(context.Background(), platform.Heartbeat{}); err == nil || !strings.Contains(err.Error(), "no server token") {
		t.Fatalf("error = %v", err)
	}
}

func TestSaveTokenWritesForRootAlone(t *testing.T) {
	fake := modtest.NewFakeSys()

	if err := platform.SaveToken(fake, "/etc/pupitre/server.token", "jeton\n"); err != nil {
		t.Fatalf("SaveToken: %v", err)
	}

	if mode := fake.Modes["/etc/pupitre/server.token"]; mode != 0o600 {
		t.Fatalf("mode = %o", mode)
	}

	token, err := platform.LoadToken(fake, "/etc/pupitre/server.token")
	if err != nil || token != "jeton" {
		t.Fatalf("token = %q, err = %v", token, err)
	}

	if !platform.Enrolled(fake, "/etc/pupitre/server.token") {
		t.Fatal("Enrolled says no after SaveToken")
	}
}

func TestSaveTokenRefusesAnEmptyToken(t *testing.T) {
	if err := platform.SaveToken(modtest.NewFakeSys(), "/etc/pupitre/server.token", " \n"); err == nil {
		t.Fatal("an empty token was written")
	}
}

// TestExchangeGivesUpOnAPlatformThatDoesNotAnswer: the app gives up on the command before the agent does — a stalled exchange must return a failure, not hold the line open.
func TestExchangeGivesUpOnAPlatformThatDoesNotAnswer(t *testing.T) {
	held := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-held
	}))
	defer server.Close()
	defer close(held)

	client := platform.Client{BaseURL: server.URL, ControlTimeout: 40 * time.Millisecond}

	done := make(chan error, 1)
	go func() {
		_, err := client.Exchange(context.Background(), platform.Enrollment{Token: "jeton", HostPublicKey: "ssh-ed25519 AAAA"})
		done <- err
	}()

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("an exchange without an answer succeeded")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("the exchange holds the line past its timeout")
	}
}

// TestReleaseKeepsTheLongTimeout: downloading the binary keeps the long timeout — it is not a control command.
func TestReleaseKeepsTheLongTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(80 * time.Millisecond)
		w.Write([]byte("ELF"))
	}))
	defer server.Close()

	body, err := platform.Client{BaseURL: server.URL, Token: "jeton", ControlTimeout: time.Millisecond}.Release(context.Background(), "1.2.3")
	if err != nil || string(body) != "ELF" {
		t.Fatalf("body %q, err = %v", body, err)
	}
}
