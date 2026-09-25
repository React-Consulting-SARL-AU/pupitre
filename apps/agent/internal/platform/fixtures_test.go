package platform_test

import (
	"encoding/json"
	"os"
	"testing"

	"pupitre.studio/agent/internal/platform"
)

func TestTheDefaultPlatformIsTheOneSharedNames(t *testing.T) {
	raw, err := os.ReadFile("../contract/platform.fixtures.json")
	if err != nil {
		t.Fatal(err)
	}

	var fixtures struct {
		APIURL string `json:"api_url"`
	}
	if err := json.Unmarshal(raw, &fixtures); err != nil {
		t.Fatal(err)
	}

	if fixtures.APIURL == "" || platform.DefaultBaseURL != fixtures.APIURL {
		t.Fatalf("agent %q, shared %q", platform.DefaultBaseURL, fixtures.APIURL)
	}
}
