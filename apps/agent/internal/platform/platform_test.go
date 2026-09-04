package platform_test

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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
