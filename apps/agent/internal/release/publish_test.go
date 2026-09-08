package release_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"pupitre.studio/agent/internal/release"
)

type call struct {
	Path   string
	Bearer string
	Body   map[string]any
}

func platform(t *testing.T, status int, answer string) (*release.API, *[]call) {
	t.Helper()

	calls := make([]call, 0, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)

		decoded := map[string]any{}
		_ = json.Unmarshal(body, &decoded)

		calls = append(calls, call{Path: r.URL.Path, Bearer: r.Header.Get("authorization"), Body: decoded})

		w.Header().Set("content-type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(answer))
	}))

	t.Cleanup(server.Close)

	return &release.API{BaseURL: server.URL, Token: "jeton-de-test"}, &calls
}

func TestPublishSendsTheBodyTheContractDescribes(t *testing.T) {
	api, calls := platform(t, http.StatusCreated, `{"data":{"version":"1.4.2","arch":"amd64","sha256":"ab","signature":"sig","r2_key":"agent/1.4.2/pupitred-linux-amd64","channel":"beta"}}`)

	published, created, err := api.Publish(release.Publication{
		Version:   "1.4.2",
		Arch:      "amd64",
		SHA256:    "ab",
		Signature: "sig",
		R2Key:     "agent/1.4.2/pupitred-linux-amd64",
		Channel:   "beta",
	})
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}

	if !created || published.Version != "1.4.2" {
		t.Fatalf("created = %v, version = %s", created, published.Version)
	}

	sent := (*calls)[0]

	if sent.Path != "/admin/releases" || sent.Bearer != "Bearer jeton-de-test" {
		t.Fatalf("call = %s, authorization = %q", sent.Path, sent.Bearer)
	}

	for _, field := range []string{"version", "arch", "sha256", "signature", "r2_key", "channel"} {
		if _, ok := sent.Body[field]; !ok {
			t.Errorf("field %s missing from the body", field)
		}
	}
}

// A rerun of the workflow republishes the same version: the platform answers 200, and that is not a failure.
func TestPublishAcceptsAVersionAlreadyPublished(t *testing.T) {
	api, _ := platform(t, http.StatusOK, `{"data":{"version":"1.4.2","arch":"amd64","channel":"stable"}}`)

	published, created, err := api.Publish(release.Publication{Version: "1.4.2", Arch: "amd64"})
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}

	if created || published.Channel != "stable" {
		t.Fatalf("created = %v, channel = %s", created, published.Channel)
	}
}

func TestPublishReportsWhatThePlatformRefused(t *testing.T) {
	api, _ := platform(t, http.StatusConflict, `{"error":{"code":"conflict","message":"already published with a different fingerprint","fix":"Publish a new version."}}`)

	_, _, err := api.Publish(release.Publication{Version: "1.4.2", Arch: "amd64"})

	failure, ok := err.(*release.APIError)
	if !ok {
		t.Fatalf("erreur = %v", err)
	}

	if failure.Status != http.StatusConflict || failure.Code != "conflict" || failure.Fix == "" {
		t.Fatalf("erreur = %+v", failure)
	}
}

func TestPromoteMovesEveryArchitectureOfTheVersion(t *testing.T) {
	api, calls := platform(t, http.StatusOK, `{"data":[{"version":"1.4.2","arch":"amd64","channel":"stable"},{"version":"1.4.2","arch":"arm64","channel":"stable"}]}`)

	promoted, err := api.Promote("1.4.2", "stable")
	if err != nil {
		t.Fatalf("Promote: %v", err)
	}

	if len(promoted) != 2 {
		t.Fatalf("%d architectures promues", len(promoted))
	}

	sent := (*calls)[0]

	if sent.Path != "/admin/releases/1.4.2/promote" || sent.Body["channel"] != "stable" {
		t.Fatalf("appel = %s, corps = %v", sent.Path, sent.Body)
	}
}
