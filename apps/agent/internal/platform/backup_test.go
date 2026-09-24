package platform_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/platform"
)

func TestABackupIsDeclaredThenForgottenWithTheServerToken(t *testing.T) {
	var seen []string
	var declared contract.BackupDeclaration

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.Method+" "+r.URL.Path+" "+r.Header.Get("Authorization"))

		switch r.Method {
		case http.MethodPost:
			_ = json.NewDecoder(r.Body).Decode(&declared)
			w.WriteHeader(http.StatusCreated)
		case http.MethodDelete:
			if r.URL.Path == "/agent/backups/20260101T000000Z-000000" {
				w.WriteHeader(http.StatusNotFound)

				return
			}
			w.WriteHeader(http.StatusNoContent)
		}
	}))
	defer server.Close()

	client := platform.Client{BaseURL: server.URL, Token: "jeton"}

	if err := client.DeclareBackup(context.Background(), contract.BackupDeclaration{ID: "20260924T030000Z-abcdef", Trigger: contract.BackupTriggerSchedule}); err != nil {
		t.Fatal(err)
	}

	if err := client.ForgetBackup(context.Background(), "20260924T030000Z-abcdef"); err != nil {
		t.Fatal(err)
	}

	if err := client.ForgetBackup(context.Background(), "20260101T000000Z-000000"); err != nil {
		t.Fatalf("a backup the platform never knew is already forgotten: %v", err)
	}

	if declared.ID != "20260924T030000Z-abcdef" || len(seen) != 3 || seen[0] != "POST /agent/backups Bearer jeton" || seen[1] != "DELETE /agent/backups/20260924T030000Z-abcdef Bearer jeton" {
		t.Fatalf("seen = %v, declared %+v", seen, declared)
	}
}

func TestTheServerIDIsWrittenOnceAndOnlyWhenItChanges(t *testing.T) {
	fake := modtest.NewFakeSys()

	if platform.LoadServerID(fake, "") != "" {
		t.Fatal("no id before the platform names one")
	}

	written, err := platform.SaveServerID(fake, "", "srv_42")
	if err != nil || !written || platform.LoadServerID(fake, "") != "srv_42" {
		t.Fatalf("written %v, %v", written, err)
	}

	if again, _ := platform.SaveServerID(fake, "", "srv_42"); again {
		t.Fatal("the same id is not written twice")
	}

	if empty, _ := platform.SaveServerID(fake, "", " "); empty || platform.LoadServerID(fake, "") != "srv_42" {
		t.Fatal("an answer without an id keeps the one known")
	}
}

func TestTheStoredClientSpeaksToTheEnrolmentsPlatformWithItsToken(t *testing.T) {
	fake := modtest.NewFakeSys()

	if _, err := platform.Stored(fake, platform.Client{}, "", ""); err == nil {
		t.Fatal("a server without a token has nothing to speak with")
	}

	fake.Files[platform.DefaultTokenPath] = []byte("jeton\n")
	fake.Files[platform.DefaultBaseURLPath] = []byte("https://dev.pupitre.studio/api/v1\n")

	client, err := platform.Stored(fake, platform.Client{BaseURL: "https://elsewhere", Version: "1.0.0"}, "", "")
	if err != nil || client.Token != "jeton" || client.BaseURL != "https://dev.pupitre.studio/api/v1" || client.Version != "1.0.0" {
		t.Fatalf("client = %+v, %v", client, err)
	}
}
