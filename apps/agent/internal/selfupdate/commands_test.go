package selfupdate_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/selfupdate"
)

type response struct {
	ID     int64           `json:"id"`
	OK     bool            `json:"ok"`
	Result json.RawMessage `json:"result"`
	Error  *protocol.Error `json:"error"`
}

func serve(t *testing.T, b *bench, granted contract.Entitlement, requests ...string) []response {
	t.Helper()

	server := protocol.NewServer(protocol.Options{AgentVersion: currentAgent, Entitlement: entitlement.Fixed(granted)})
	selfupdate.RegisterCommands(server, b.options)

	var out strings.Builder
	if err := server.Serve(strings.NewReader(strings.Join(requests, "\n")+"\n"), &out); err != nil {
		t.Fatalf("Serve: %v", err)
	}

	var answers []response
	for _, line := range strings.Split(strings.TrimSpace(out.String()), "\n") {
		var answer response
		if err := json.Unmarshal([]byte(line), &answer); err != nil {
			t.Fatalf("unreadable answer %q: %v", line, err)
		}
		answers = append(answers, answer)
	}

	return answers
}

// An agent left behind is exactly the one that must be able to repair itself, so the restricted mode lets agent.upgrade through — with nothing but a version, and a platform that no longer says how this server is doing.
func TestAgentUpgradeAnswersInRestrictedMode(t *testing.T) {
	b := newBench(t)
	b.stateStatus = http.StatusUnauthorized

	answers := serve(t, b, contract.EntitlementRestricted,
		`{"id":1,"cmd":"hello","params":{"app_version":"1.0.0","protocol":2}}`,
		`{"id":2,"cmd":"agent.upgrade","params":{"version":"`+nextAgent+`"}}`,
	)

	if len(answers) != 2 || !answers[1].OK {
		t.Fatalf("answers = %+v", answers)
	}

	value, err := contract.Decode(answers[1].Result)
	if err != nil {
		t.Fatalf("unreadable result: %v", err)
	}

	if err := contract.Validate("AgentUpgradeResult", value); err != nil {
		t.Fatalf("result outside the contract: %v", err)
	}

	if string(b.fake.Files[binaryPath]) != string(newBinary) {
		t.Fatalf("binaire en place : %q", b.fake.Files[binaryPath])
	}
}

func TestAgentUpgradeIsAnnouncedAmongTheCapabilities(t *testing.T) {
	b := newBench(t)

	answers := serve(t, b, contract.EntitlementRestricted,
		`{"id":1,"cmd":"hello","params":{"app_version":"1.0.0","protocol":2}}`,
	)

	if !strings.Contains(string(answers[0].Result), `"agent.upgrade"`) {
		t.Fatalf("capabilities: %s", answers[0].Result)
	}
}

func TestAgentUpgradeRefusesADowngradeThroughTheProtocol(t *testing.T) {
	b := newBench(t)

	answers := serve(t, b, contract.EntitlementValid,
		`{"id":1,"cmd":"hello","params":{"app_version":"1.0.0","protocol":2}}`,
		`{"id":2,"cmd":"agent.upgrade","params":{"version":"`+olderAgent+`"}}`,
	)

	if answers[1].OK || answers[1].Error.Code != contract.ErrorDowngradeRefused {
		t.Fatalf("answer = %+v", answers[1])
	}

	if string(b.fake.Files[binaryPath]) != string(oldBinary) {
		t.Fatalf("binaire en place : %q", b.fake.Files[binaryPath])
	}
}

func TestAgentUpgradeInstallsAnOlderVersionOnTheOwnersWord(t *testing.T) {
	b := newBench(t)

	answers := serve(t, b, contract.EntitlementValid,
		`{"id":1,"cmd":"hello","params":{"app_version":"1.0.0","protocol":2}}`,
		`{"id":2,"cmd":"agent.upgrade","params":{"version":"`+olderAgent+`","allow_downgrade":true}}`,
	)

	if !answers[1].OK {
		t.Fatalf("answer = %+v", answers[1])
	}

	if string(b.fake.Files[binaryPath]) != string(newBinary) {
		t.Fatalf("binaire en place : %q", b.fake.Files[binaryPath])
	}
}

func TestAgentUpgradeSurfacesBadSignatureThroughTheProtocol(t *testing.T) {
	b := newBench(t)
	b.signedVersion = nextAgent

	answers := serve(t, b, contract.EntitlementRestricted,
		`{"id":1,"cmd":"hello","params":{"app_version":"1.0.0","protocol":2}}`,
		`{"id":2,"cmd":"agent.upgrade","params":{"version":"2.0.0"}}`,
	)

	if answers[1].OK || answers[1].Error.Code != contract.ErrorBadSignature {
		t.Fatalf("answer = %+v", answers[1])
	}

	if answers[1].Error.Fix == "" {
		t.Fatalf("a signature refusal must carry a fix: %+v", answers[1].Error)
	}
}
