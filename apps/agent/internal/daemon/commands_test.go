package daemon_test

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/daemon"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/platform"
	"pupitre.studio/agent/internal/protocol"
)

type response struct {
	OK     bool            `json:"ok"`
	Result json.RawMessage `json:"result"`
	Error  *protocol.Error `json:"error"`
}

func (b *bench) options() daemon.Options {
	now := func() time.Time { return b.now }

	return daemon.Options{
		Sys:          b.fake,
		Now:          now,
		Platform:     platform.Client{BaseURL: b.server.URL},
		Entitlement:  entitlement.New(entitlement.Options{Sys: b.fake, Now: now}),
		AgentVersion: "1.2.3",
	}
}

func serve(t *testing.T, b *bench, granted contract.Entitlement, requests ...string) []response {
	t.Helper()

	server := protocol.NewServer(protocol.Options{AgentVersion: "1.2.3", Entitlement: entitlement.Fixed(granted)})
	daemon.RegisterCommands(server, b.options())

	var out strings.Builder
	lines := append([]string{`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":1}}`}, requests...)
	if err := server.Serve(strings.NewReader(strings.Join(lines, "\n")+"\n"), &out); err != nil {
		t.Fatalf("Serve: %v", err)
	}

	var answers []response
	for _, line := range strings.Split(strings.TrimSpace(out.String()), "\n") {
		var answer response
		if err := json.Unmarshal([]byte(line), &answer); err != nil {
			t.Fatalf("réponse illisible %q : %v", line, err)
		}

		answers = append(answers, answer)
	}

	return answers[1:]
}

func assertKeysResult(t *testing.T, answer response, fingerprints int) {
	t.Helper()

	if !answer.OK {
		t.Fatalf("refus : %v", answer.Error)
	}

	if err := contract.Validate("KeysListResult", decode(t, answer.Result)); err != nil {
		t.Fatalf("résultat hors contrat : %v", err)
	}

	var result struct {
		Keys []struct {
			Fingerprint string `json:"fingerprint"`
			Comment     string `json:"comment"`
		} `json:"keys"`
		SyncedAt string `json:"synced_at"`
	}
	json.Unmarshal(answer.Result, &result)

	if len(result.Keys) != fingerprints {
		t.Fatalf("%d clé(s), attendu %d", len(result.Keys), fingerprints)
	}

	for _, key := range result.Keys {
		if !strings.HasPrefix(key.Fingerprint, "SHA256:") {
			t.Errorf("empreinte = %q", key.Fingerprint)
		}
	}
}

func decode(t *testing.T, raw json.RawMessage) any {
	t.Helper()

	value, err := contract.Decode(raw)
	if err != nil {
		t.Fatalf("JSON invalide %s : %v", raw, err)
	}

	return value
}

func TestKeysSyncThenKeysListAnswerTheContract(t *testing.T) {
	b := newBench(t, true)
	b.platform.allow(laptop, desktop)

	answers := serve(t, b, contract.EntitlementValid,
		`{"id":2,"cmd":"keys.sync","params":{}}`,
		`{"id":3,"cmd":"keys.list","params":{}}`,
	)

	assertKeysResult(t, answers[0], 2)
	assertKeysResult(t, answers[1], 2)

	var listed struct {
		SyncedAt string `json:"synced_at"`
	}
	json.Unmarshal(answers[1].Result, &listed)

	if listed.SyncedAt != noon.Format(time.RFC3339) {
		t.Fatalf("synced_at = %q", listed.SyncedAt)
	}
}

// Nothing has been read yet: the block is empty, and keys.list says so rather than failing.
func TestKeysListAnswersAnEmptyBlock(t *testing.T) {
	b := newBench(t, true)

	assertKeysResult(t, serve(t, b, contract.EntitlementValid, `{"id":2,"cmd":"keys.list","params":{}}`)[0], 0)
}

func TestKeysSyncSaysWhenThePlatformRefusesTheToken(t *testing.T) {
	b := newBench(t, true)
	b.platform.suspend(401)

	answer := serve(t, b, contract.EntitlementValid, `{"id":2,"cmd":"keys.sync","params":{}}`)[0]
	if answer.OK || answer.Error.Code != contract.ErrorEntitlementRequired || answer.Error.Fix == "" {
		t.Fatalf("réponse = %+v", answer)
	}
}

func TestKeysSyncSaysWhenTheServerIsNotEnrolled(t *testing.T) {
	b := newBench(t, false)

	answer := serve(t, b, contract.EntitlementValid, `{"id":2,"cmd":"keys.sync","params":{}}`)[0]
	if answer.OK || answer.Error.Code != contract.ErrorBadRequest {
		t.Fatalf("réponse = %+v", answer)
	}
}

// In restricted mode, keys.* is among what the contract closes.
func TestTheKeysCommandsCloseInRestrictedMode(t *testing.T) {
	b := newBench(t, true)

	for _, answer := range serve(t, b, contract.EntitlementRestricted,
		`{"id":2,"cmd":"keys.sync","params":{}}`,
		`{"id":3,"cmd":"keys.list","params":{}}`,
	) {
		if answer.OK || answer.Error.Code != contract.ErrorEntitlementRequired {
			t.Errorf("réponse = %+v", answer)
		}
	}
}
