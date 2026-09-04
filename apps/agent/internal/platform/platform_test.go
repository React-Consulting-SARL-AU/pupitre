package platform_test

import (
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

	body, err := platform.Client{BaseURL: server.URL, Token: "jeton"}.Release("1.2.3")
	if err != nil {
		t.Fatalf("Release: %v", err)
	}

	if string(body) != "ELF" || seen != "Bearer jeton" {
		t.Fatalf("corps %q, en-tête %q", body, seen)
	}
}

func TestReleaseAsksForTheVersionOfTheRequest(t *testing.T) {
	var path string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
	}))
	defer server.Close()

	if _, err := (platform.Client{BaseURL: server.URL + "/api/v1", Token: "jeton"}).Release("1.2.3"); err != nil {
		t.Fatalf("Release: %v", err)
	}

	if path != "/api/v1/agent/release/1.2.3" {
		t.Fatalf("chemin demandé : %s", path)
	}
}

// The platform answers 303 towards a signed storage URL; the token stops at the platform.
func TestReleaseFollowsTheRedirectWithoutLeakingTheToken(t *testing.T) {
	storage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" {
			t.Errorf("le jeton a suivi la redirection : %s", r.Header.Get("Authorization"))
		}
		w.Write([]byte("binaire signé"))
	}))
	defer storage.Close()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, storage.URL+"/pupitred", http.StatusSeeOther)
	}))
	defer server.Close()

	body, err := platform.Client{BaseURL: server.URL, Token: "jeton"}.Release("1.2.3")
	if err != nil {
		t.Fatalf("Release: %v", err)
	}

	if string(body) != "binaire signé" {
		t.Fatalf("corps : %q", body)
	}
}

func TestReleaseTellsAnUnknownVersionApartFromAFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	_, err := platform.Client{BaseURL: server.URL, Token: "jeton"}.Release("9.9.9")

	var failure *platform.Error
	if !errors.As(err, &failure) || !failure.NotFound() {
		t.Fatalf("erreur = %v", err)
	}
}

func TestReleaseRefusesABodyBeyondTheCap(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte(strings.Repeat("x", 64)))
	}))
	defer server.Close()

	_, err := platform.Client{BaseURL: server.URL, Token: "jeton", MaxBytes: 16}.Release("1.2.3")
	if err == nil || !strings.Contains(err.Error(), "au-delà de 16 octets") {
		t.Fatalf("erreur = %v", err)
	}
}

func TestClientRefusesAPlaintextPlatform(t *testing.T) {
	_, err := platform.Client{BaseURL: "http://pupitre.example", Token: "jeton"}.Release("1.2.3")
	if err == nil || !strings.Contains(err.Error(), "non chiffrée") {
		t.Fatalf("erreur = %v", err)
	}
}

func TestClientRefusesToCallWithoutAToken(t *testing.T) {
	_, err := platform.Client{BaseURL: "https://pupitre.example"}.Release("1.2.3")
	if err == nil || !strings.Contains(err.Error(), "aucun jeton") {
		t.Fatalf("erreur = %v", err)
	}
}

func TestTargetVersionReadsTheStateOfTheServer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/agent/state" {
			t.Errorf("chemin demandé : %s", r.URL.Path)
		}
		w.Write([]byte(`{"entitlement":"valid","target_version":"1.4.0"}`))
	}))
	defer server.Close()

	version, err := platform.Client{BaseURL: server.URL, Token: "jeton"}.TargetVersion()
	if err != nil || version != "1.4.0" {
		t.Fatalf("version = %q, err = %v", version, err)
	}
}

func TestLoadTokenRefusesAnEmptyFile(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files["/etc/pupitre/server.token"] = []byte("  \n")

	if _, err := platform.LoadToken(fake, "/etc/pupitre/server.token"); !errors.Is(err, platform.ErrNoToken) {
		t.Fatalf("erreur = %v", err)
	}
}

func TestLoadTokenTrimsTheFile(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files["/etc/pupitre/server.token"] = []byte("jeton-de-serveur\n")

	token, err := platform.LoadToken(fake, "/etc/pupitre/server.token")
	if err != nil || token != "jeton-de-serveur" {
		t.Fatalf("jeton = %q, err = %v", token, err)
	}
}

func TestStateReadsEverythingTheAgentPolls(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/agent/state" || r.Method != http.MethodGet {
			t.Errorf("%s %s", r.Method, r.URL.Path)
		}
		w.Write([]byte(`{"entitlement":"grace","valid_until":"2026-09-05T12:00:00.000Z","authorized_keys":["ssh-ed25519 AAAA jordan@laptop"],"target_version":"1.4.0","hostname":"vps","module_params":{}}`))
	}))
	defer server.Close()

	state, err := platform.Client{BaseURL: server.URL, Token: "jeton"}.State()
	if err != nil {
		t.Fatalf("State: %v", err)
	}

	if state.Entitlement != "grace" || state.TargetVersion != "1.4.0" || state.Hostname != "vps" {
		t.Fatalf("state = %+v", state)
	}

	if len(state.AuthorizedKeys) != 1 || !state.ValidUntil.Equal(time.Date(2026, time.September, 5, 12, 0, 0, 0, time.UTC)) {
		t.Fatalf("clés %v, valide jusqu'à %s", state.AuthorizedKeys, state.ValidUntil)
	}
}

// The platform leaves target_version null while no release is published for this architecture.
func TestStateAcceptsANullTargetVersion(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte(`{"entitlement":"valid","valid_until":"2026-09-05T12:00:00.000Z","authorized_keys":[],"target_version":null,"hostname":"vps","module_params":{}}`))
	}))
	defer server.Close()

	state, err := platform.Client{BaseURL: server.URL, Token: "jeton"}.State()
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

	token, err := platform.Client{BaseURL: server.URL}.Exchange(platform.Enrollment{
		Token:         "jeton-d-enrolement",
		HostPublicKey: "ssh-ed25519 AAAA root@vps",
		AgentVersion:  "1.2.3",
		Arch:          "amd64",
	})
	if err != nil || token != "jeton-de-serveur" {
		t.Fatalf("jeton = %q, err = %v", token, err)
	}

	if seen.Token != "jeton-d-enrolement" || seen.Arch != "amd64" || authorization != "" {
		t.Fatalf("envoyé %+v, en-tête %q", seen, authorization)
	}
}

func TestExchangeCarriesTheRefusalOfThePlatform(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusConflict)
		w.Write([]byte(`{"error":{"code":"enrollment_used","message":"jeton déjà échangé"}}`))
	}))
	defer server.Close()

	_, err := platform.Client{BaseURL: server.URL}.Exchange(platform.Enrollment{Token: "x"})

	var failure *platform.Error
	if !errors.As(err, &failure) || failure.Code != "enrollment_used" || failure.Status != http.StatusConflict {
		t.Fatalf("erreur = %v", err)
	}

	if !strings.Contains(err.Error(), "jeton déjà échangé") {
		t.Fatalf("message = %q", err.Error())
	}
}

func TestBeatSendsTheSampleAndAcceptsAnEmptyAnswer(t *testing.T) {
	var body map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer jeton" {
			t.Errorf("en-tête %q", r.Header.Get("Authorization"))
		}
		json.NewDecoder(r.Body).Decode(&body)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	err := platform.Client{BaseURL: server.URL, Token: "jeton"}.Beat(platform.Heartbeat{
		Disk: 41, RAM: 62, Load: 0.4, StackVersion: "1.2.3", AgentVersion: "1.2.3",
	})
	if err != nil {
		t.Fatalf("Beat: %v", err)
	}

	if body["disk"] != float64(41) || body["stack_version"] != "1.2.3" {
		t.Fatalf("corps = %v", body)
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
	if err := (platform.Client{BaseURL: "https://pupitre.example"}).Beat(platform.Heartbeat{}); err == nil || !strings.Contains(err.Error(), "aucun jeton") {
		t.Fatalf("erreur = %v", err)
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
		t.Fatalf("jeton = %q, err = %v", token, err)
	}

	if !platform.Enrolled(fake, "/etc/pupitre/server.token") {
		t.Fatal("Enrolled dit non après SaveToken")
	}
}

func TestSaveTokenRefusesAnEmptyToken(t *testing.T) {
	if err := platform.SaveToken(modtest.NewFakeSys(), "/etc/pupitre/server.token", " \n"); err == nil {
		t.Fatal("un jeton vide a été écrit")
	}
}
