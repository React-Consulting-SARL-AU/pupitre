package platform_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/platform"
)

const sampleKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINIqIikYhGRpaqoJuvKifjn/NLVieWICV3MrBVyZO2Lj"

func fullHeartbeat() platform.Heartbeat {
	return platform.Heartbeat{
		Disk: 41, RAM: 62, Load: 0.4,
		Sessions:     []string{"web/claude"},
		StackVersion: "1.2.3",
		Modules:      []string{"core.system"},
		AgentVersion: "1.2.3",
		SSHUser:      "dev",
		DiskTotalGB:  556, DiskFreeGB: 1.8, RAMTotalMB: 4096, RAMUsedMB: 2048,
		Backup: &contract.BackupBeat{IntervalHours: 24, LastRunAt: "2026-09-19T03:15:00Z", LastOKAt: "2026-09-19T03:15:00Z"},
		Keys:   &contract.KeysBeat{Signers: []string{}, Pending: []string{}},
	}
}

func fullEnrollment() platform.Enrollment {
	return platform.Enrollment{Token: "jeton-d-enrolement", HostPublicKey: "ssh-ed25519 AAAA root@vps", AgentVersion: "1.2.3", Arch: "amd64"}
}

// What the agent sends is held to the contract the platform validates it against, key by key.
func TestEveryCallSendsWhatTheContractDeclares(t *testing.T) {
	sent := map[string][]byte{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		sent[r.URL.Path] = body

		if r.URL.Path == "/agent/exchange" {
			w.Write([]byte(`{"server_token":"jeton-de-serveur"}`))

			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	client := platform.Client{BaseURL: server.URL, Token: "jeton"}
	ctx := context.Background()

	if _, err := client.Exchange(ctx, fullEnrollment()); err != nil {
		t.Fatal(err)
	}
	if err := client.Beat(ctx, fullHeartbeat()); err != nil {
		t.Fatal(err)
	}
	if err := client.Beat(ctx, platform.Heartbeat{}); err != nil {
		t.Fatal(err)
	}

	for path, definition := range map[string]string{"/agent/exchange": "AgentExchange", "/agent/heartbeat": "Heartbeat"} {
		decoded, err := contract.Decode(sent[path])
		if err != nil {
			t.Fatalf("%s: %v", path, err)
		}

		if err := contract.Validate(definition, decoded); err != nil {
			t.Errorf("%s: %v", definition, err)
		}
	}
}

func TestNoFieldOfAPayloadIsUnknownToTheContract(t *testing.T) {
	for definition, value := range map[string]any{
		"AgentExchange": fullEnrollment(),
		"Heartbeat":     fullHeartbeat(),
		"AgentState":    platform.State{},
	} {
		declared := propertiesOf(t, definition)

		encoded, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}

		var fields map[string]json.RawMessage
		if err := json.Unmarshal(encoded, &fields); err != nil {
			t.Fatal(err)
		}

		for field := range fields {
			if !slices.Contains(declared, field) {
				t.Errorf("%s: %s is not in the contract", definition, field)
			}
		}
	}
}

func TestTheStateOfTheContractIsReadWhole(t *testing.T) {
	answer := `{"entitlement":"grace","valid_until":"2026-09-05T12:00:00.000Z","authorized_keys":[],"keys":[{"public_key":"` + sampleKey + `","user_id":"u1","device_id":"d1","approvals":[]}],"target_version":"1.4.0","minimum_version":"1.2.0","hostname":"vps","server_id":"cm0k2x9q80000a1b2c3d4e5f6"}`

	decoded, err := contract.Decode([]byte(answer))
	if err != nil {
		t.Fatal(err)
	}
	if err := contract.Validate("AgentState", decoded); err != nil {
		t.Fatalf("the sample is not what the platform sends: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte(answer))
	}))
	defer server.Close()

	state, err := platform.Client{BaseURL: server.URL, Token: "jeton"}.State(context.Background())
	if err != nil || state.Entitlement != "grace" || state.MinimumVersion != "1.2.0" || state.ServerID != "cm0k2x9q80000a1b2c3d4e5f6" || state.Keys == nil || len(*state.Keys) != 1 {
		t.Fatalf("state = %+v, err = %v", state, err)
	}
}

func propertiesOf(t *testing.T, definition string) []string {
	t.Helper()

	var schema struct {
		Properties map[string]json.RawMessage `json:"properties"`
	}

	raw, ok := contract.Definition(definition)
	if !ok {
		t.Fatalf("%s is not in the contract", definition)
	}
	if err := json.Unmarshal(raw, &schema); err != nil {
		t.Fatal(err)
	}

	names := make([]string, 0, len(schema.Properties))
	for name := range schema.Properties {
		names = append(names, name)
	}

	return names
}
