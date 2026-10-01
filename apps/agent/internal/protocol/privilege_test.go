package protocol

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/license"
)

func limitedServer(ran *[]string) *Server {
	server := NewServer(Options{AgentVersion: testAgentVersion, License: license.Fixed(contract.LicenseDev), Now: fixedNow, Limited: true})

	for _, cmd := range []string{"install", "snapshot", "agent.upgrade", "keys.trust"} {
		server.Register(cmd, func(_ *Context, _ json.RawMessage) (any, error) {
			*ran = append(*ran, cmd)

			return map[string]any{}, nil
		})
	}

	return server
}

func TestASessionWithoutThePasswordRefusesWhatWouldMakeRoot(t *testing.T) {
	i18n.Use("en")

	var ran []string
	server := limitedServer(&ran)

	_, err := server.Call("keys.trust", map[string]any{"public_key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl"}, nil)

	failure, ok := err.(*Error)
	if !ok || failure.Code != contract.ErrorPrivilegeRequired || failure.Fix == "" {
		t.Fatalf("error = %#v, want privilege_required with its fix", err)
	}

	if !strings.Contains(failure.Message, "keys.trust") {
		t.Fatalf("the refusal does not name the command: %q", failure.Message)
	}

	if len(ran) != 0 {
		t.Fatalf("the handler ran: %v", ran)
	}
}

func TestASessionWithoutThePasswordStillAnswersTheLimitedCommands(t *testing.T) {
	var ran []string
	server := limitedServer(&ran)

	for _, cmd := range []string{"snapshot", "ping"} {
		if _, err := server.Call(cmd, map[string]any{}, nil); err != nil {
			t.Fatalf("%s refused: %v", cmd, err)
		}
	}

	if _, err := server.Call("agent.upgrade", map[string]any{"version": "1.2.0"}, nil); err != nil {
		t.Fatalf("an upgrade above the floor refused: %v", err)
	}

	if _, err := server.Call("agent.upgrade", map[string]any{"version": "1.2.0", "allow_downgrade": true}, nil); err == nil || err.(*Error).Code != contract.ErrorPrivilegeRequired {
		t.Fatalf("a downgrade went through without the password: %v", err)
	}
}

func TestAPrivilegedSessionAnswersEverything(t *testing.T) {
	var ran []string
	server := limitedServer(&ran)
	server.options.Limited = false

	if _, err := server.Call("keys.trust", map[string]any{"public_key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl"}, nil); err != nil {
		t.Fatalf("keys.trust refused on the privileged session: %v", err)
	}
}

func TestARefusedCommandStillConsumesItsSecretLine(t *testing.T) {
	i18n.Use("en")

	var ran []string
	server := limitedServer(&ran)

	input := strings.Join([]string{
		`{"id":1,"cmd":"hello","params":{"app_version":"0.0.0","protocol":` + jsonNumber(contract.ProtocolVersion) + `}}`,
		`{"id":2,"cmd":"install","params":{"modules":["core.system"],"config":{},"secrets_stdin":true}}`,
		`{"core.system":{"password":"s3cret"}}`,
		`{"id":4,"cmd":"snapshot"}`,
	}, "\n") + "\n"

	var out bytes.Buffer
	if err := server.Serve(strings.NewReader(input), &out); err != nil {
		t.Fatal(err)
	}

	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 3 {
		t.Fatalf("answers = %v", lines)
	}

	if !strings.Contains(lines[1], `"code":"privilege_required"`) || !strings.Contains(lines[2], `"id":4,"ok":true`) {
		t.Fatalf("answers = %v", lines)
	}

	if strings.Contains(out.String(), "s3cret") {
		t.Fatal("the secret line was answered")
	}

	if len(ran) != 1 || ran[0] != "snapshot" {
		t.Fatalf("handlers run = %v", ran)
	}
}

func jsonNumber(value int) string {
	raw, _ := json.Marshal(value)

	return string(raw)
}
