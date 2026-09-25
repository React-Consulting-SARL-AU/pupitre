package daemon_test

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/daemon"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/keys"
	"pupitre.studio/agent/internal/modules/modtest"
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
		Arch:         "amd64",
		LogPath:      b.logPath,
		Euid:         func() int { return 0 },
	}
}

func serve(t *testing.T, b *bench, granted contract.Entitlement, requests ...string) []response {
	t.Helper()

	return session(t, b, entitlement.Fixed(granted), requests...)
}

// recorded is the entitlement the daemon wrote down for the machine, as a release build resolves it: a development build answers its own whatever is written.
func (b *bench) recorded() contract.Entitlement {
	cache, err := entitlement.ReadCache(b.fake, entitlement.DefaultCachePath)
	if err != nil {
		return contract.EntitlementRestricted
	}

	return cache.Resolve(b.now, entitlement.DefaultTolerance)
}

// The same session, with the entitlement the machine itself resolves: that is what tells an unenrolled binary apart.
func serveResolved(t *testing.T, b *bench, requests ...string) []response {
	t.Helper()

	resolver := entitlement.New(entitlement.Options{Sys: b.fake, Now: func() time.Time { return b.now }})

	return session(t, b, resolver.State, requests...)
}

func session(t *testing.T, b *bench, granted func() entitlement.State, requests ...string) []response {
	t.Helper()

	var answers []response
	for _, line := range spoken(t, b, granted, requests...) {
		var answer response
		if err := json.Unmarshal([]byte(line), &answer); err != nil {
			t.Fatalf("unreadable answer %q: %v", line, err)
		}

		answers = append(answers, answer)
	}

	return answers[1:]
}

// Everything the agent writes back, envelopes and events alike, as raw lines.
func serveLines(t *testing.T, b *bench, requests ...string) []string {
	t.Helper()

	resolver := entitlement.New(entitlement.Options{Sys: b.fake, Now: func() time.Time { return b.now }})

	return spoken(t, b, resolver.State, requests...)
}

func spoken(t *testing.T, b *bench, granted func() entitlement.State, requests ...string) []string {
	t.Helper()

	server := protocol.NewServer(protocol.Options{AgentVersion: "1.2.3", Entitlement: granted})
	daemon.RegisterCommands(server, b.options())

	var out strings.Builder
	lines := append([]string{`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":2}}`}, requests...)
	if err := server.Serve(strings.NewReader(strings.Join(lines, "\n")+"\n"), &out); err != nil {
		t.Fatalf("Serve: %v", err)
	}

	return strings.Split(strings.TrimSpace(out.String()), "\n")
}

func assertKeysResult(t *testing.T, answer response, fingerprints int) {
	t.Helper()

	if !answer.OK {
		t.Fatalf("refus : %v", answer.Error)
	}

	if err := contract.Validate("KeysListResult", decode(t, answer.Result)); err != nil {
		t.Fatalf("result outside the contract: %v", err)
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
		t.Fatalf("%d key(s), want %d", len(result.Keys), fingerprints)
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
	b.trusting(t, laptopDevice)
	b.platform.want(asked(laptopDevice), asked(desktopDevice, laptopDevice.approves(t, desktopDevice, b.now)), asked(phoneDevice))

	answers := serve(t, b, contract.EntitlementValid,
		`{"id":2,"cmd":"keys.sync","params":{}}`,
		`{"id":3,"cmd":"keys.list","params":{}}`,
	)

	assertKeysResult(t, answers[0], 2)
	assertKeysResult(t, answers[1], 2)

	var listed struct {
		Keys []struct {
			Fingerprint string `json:"fingerprint"`
			Signer      bool   `json:"signer"`
		} `json:"keys"`
		Pending  []string `json:"pending"`
		SyncedAt string   `json:"synced_at"`
	}
	json.Unmarshal(answers[1].Result, &listed)

	if listed.SyncedAt != noon.Format(time.RFC3339) {
		t.Fatalf("synced_at = %q", listed.SyncedAt)
	}

	if len(listed.Pending) != 1 || listed.Pending[0] != phoneDevice.fingerprint(t) {
		t.Fatalf("pending = %v", listed.Pending)
	}

	for _, key := range listed.Keys {
		if !key.Signer {
			t.Fatalf("every key the agent kept is a signer: %+v", listed.Keys)
		}
	}
}

// A key in the block that nobody laid over SSH nor approved is listed, and said not to be a signer.
func TestKeysListSaysWhichKeysSign(t *testing.T) {
	b := newBench(t, true)
	b.trusting(t, laptopDevice)
	keys.Sync(modtest.NewSysContext(b.fake), keys.Target{Path: keys.DefaultPath}, []keys.Key{laptopDevice.key(t), desktopDevice.key(t)})

	answer := serve(t, b, contract.EntitlementValid, `{"id":2,"cmd":"keys.list","params":{}}`)[0]
	assertKeysResult(t, answer, 2)

	var listed struct {
		Keys []struct {
			Fingerprint string `json:"fingerprint"`
			Signer      bool   `json:"signer"`
		} `json:"keys"`
		Pending []string `json:"pending"`
	}
	json.Unmarshal(answer.Result, &listed)

	for _, key := range listed.Keys {
		if key.Signer != (key.Fingerprint == laptopDevice.fingerprint(t)) {
			t.Fatalf("keys = %+v", listed.Keys)
		}
	}

	if listed.Pending != nil {
		t.Fatalf("no state was read, nothing is pending: %v", listed.Pending)
	}
}

// The root of trust is laid over the app's own SSH session: the key signs from now on, and opens the server at once.
func TestKeysTrustLaysTheDeviceKey(t *testing.T) {
	b := newBench(t, true)
	b.trusting(t, laptopDevice)

	answers := serve(t, b, contract.EntitlementValid,
		`{"id":2,"cmd":"keys.trust","params":{"public_key":"`+desktopDevice.line+`"}}`,
		`{"id":3,"cmd":"keys.trust","params":{"public_key":"`+desktopDevice.line+`"}}`,
	)

	assertKeysResult(t, answers[0], 2)
	assertKeysResult(t, answers[1], 2)

	if err := contract.Validate("KeysTrustResult", decode(t, answers[0].Result)); err != nil {
		t.Fatal(err)
	}

	trust := b.trust(t)
	if !trust.Trusts(desktopDevice.fingerprint(t)) || len(trust.Signers) != 2 || trust.Signers[1].Via != keys.ViaOnboarding {
		t.Fatalf("trust = %+v", trust)
	}

	if !b.opens(desktopDevice) || !b.opens(laptopDevice) || !strings.Contains(b.authorized(), own) {
		t.Fatalf("authorized_keys:\n%s", b.authorized())
	}

	if b.fake.Modes[keys.DefaultSignersPath] != 0o600 {
		t.Fatalf("signers mode = %o", b.fake.Modes[keys.DefaultSignersPath])
	}
}

// Laying a key again over SSH outranks the removal the platform asked for earlier.
func TestKeysTrustClearsAnEarlierRemoval(t *testing.T) {
	b := newBench(t, true)
	b.trusting(t, laptopDevice, desktopDevice)
	b.platform.want(asked(laptopDevice))
	b.sync(t, b.agent())

	if _, gone := b.trust(t).RemovedAt(desktopDevice.fingerprint(t)); !gone {
		t.Fatal("no removal to clear")
	}

	answer := serve(t, b, contract.EntitlementValid, `{"id":2,"cmd":"keys.trust","params":{"public_key":"`+desktopDevice.line+`"}}`)[0]
	assertKeysResult(t, answer, 2)

	if _, gone := b.trust(t).RemovedAt(desktopDevice.fingerprint(t)); gone {
		t.Fatal("the removal outlives the gesture")
	}
}

func TestKeysTrustRefusesWhatCannotSign(t *testing.T) {
	b := newBench(t, true)
	ecdsaBody := "AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBNH5F8J50Xgsj+WzK4rJlQktX5PrBNTPY3qWAXqzpfdCVu0jyBMPMYXiiNXEKaKpAhcqV3CKKAS1HTNag6sqX9s="

	for _, key := range []string{
		"ssh-ed25519 " + ecdsaBody,
		"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7",
		desktopDevice.line + " jordan@desktop",
		`command=\"true\" ` + desktopDevice.line,
	} {
		answer := serve(t, b, contract.EntitlementValid, `{"id":2,"cmd":"keys.trust","params":{"public_key":"`+key+`"}}`)[0]
		if answer.OK || answer.Error.Code != contract.ErrorBadRequest {
			t.Fatalf("%s: answer = %+v", key, answer)
		}
	}

	if _, written := b.fake.Files[keys.DefaultSignersPath]; written || b.opens(desktopDevice) {
		t.Fatal("a refused key was laid")
	}
}

func TestKeysTrustNeedsARootServe(t *testing.T) {
	b := newBench(t, true)
	options := b.options()
	options.Euid = func() int { return 1000 }

	server := protocol.NewServer(protocol.Options{AgentVersion: "1.2.3", Entitlement: entitlement.Fixed(contract.EntitlementValid)})
	daemon.RegisterCommands(server, options)

	_, err := server.Call("keys.trust", map[string]any{"public_key": desktopDevice.line}, nil)

	var refusal *protocol.Error
	if !errors.As(err, &refusal) || refusal.Code != contract.ErrorBadRequest || !strings.Contains(refusal.Fix, "sudo pupitred serve --privileged") {
		t.Fatalf("err = %v", err)
	}

	if b.opens(desktopDevice) {
		t.Fatal("a key was laid by a serve that is not root")
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
		t.Fatalf("answer = %+v", answer)
	}
}

func TestKeysSyncSaysWhenTheServerIsNotEnrolled(t *testing.T) {
	b := newBench(t, false)

	answer := serve(t, b, contract.EntitlementValid, `{"id":2,"cmd":"keys.sync","params":{}}`)[0]
	if answer.OK || answer.Error.Code != contract.ErrorBadRequest {
		t.Fatalf("answer = %+v", answer)
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
			t.Errorf("answer = %+v", answer)
		}
	}
}

const enrollmentToken = "enr-jeton-tres-secret"

func enrollRequests(b *bench) []string {
	return []string{
		`{"id":2,"cmd":"enroll","params":{"platform_url":"` + b.server.URL + `","secrets_stdin":true}}`,
		`{"enrollment_token":"` + enrollmentToken + `"}`,
	}
}

// The app hands the token on the secret line, the agent trades it, and nothing of it stays anywhere it could be read.
func TestEnrollTradesTheTokenTakenFromTheSecretLine(t *testing.T) {
	b := newBench(t, false)
	b.platform.want()

	answers := serveResolved(t, b, enrollRequests(b)...)
	if len(answers) != 1 {
		t.Fatalf("%d answer(s)", len(answers))
	}

	answer := answers[0]
	if !answer.OK {
		t.Fatalf("refus : %v", answer.Error)
	}

	if err := contract.Validate("EnrollResult", decode(t, answer.Result)); err != nil {
		t.Fatalf("result outside the contract: %v", err)
	}

	var result struct {
		Enrolled    bool   `json:"enrolled"`
		Entitlement string `json:"entitlement"`
		SyncedAt    string `json:"synced_at"`
	}
	json.Unmarshal(answer.Result, &result)

	resolved := entitlement.New(entitlement.Options{Sys: b.fake, Now: func() time.Time { return b.now }}).Current()
	if !result.Enrolled || result.Entitlement != string(resolved) || result.SyncedAt == "" {
		t.Fatalf("result = %+v, the machine now resolves %s", result, resolved)
	}

	if recorded := b.recorded(); recorded != contract.EntitlementValid {
		t.Fatalf("the first state read must be written down valid, got %s", recorded)
	}

	if len(b.platform.traded) != 1 || b.platform.traded[0].Token != enrollmentToken {
		t.Fatalf("traded %+v", b.platform.traded)
	}

	if b.platform.traded[0].HostPublicKey != hostKey || b.platform.traded[0].Arch != "amd64" {
		t.Fatalf("traded %+v", b.platform.traded[0])
	}

	token, err := platform.LoadToken(b.fake, platform.DefaultTokenPath)
	if err != nil || token != "jeton-de-serveur" {
		t.Fatalf("jeton = %q, err = %v", token, err)
	}

	if platform.LoadServerID(b.fake, "") != serverID {
		t.Fatalf("the first state was not read: server id %q", platform.LoadServerID(b.fake, ""))
	}
}

// Criterion of the task: neither the journal nor a line the agent writes back carries the enrolment token.
func TestEnrollNeverWritesTheTokenDownAnywhere(t *testing.T) {
	b := newBench(t, false)

	written := serveLines(t, b, enrollRequests(b)...)

	for _, line := range written {
		if strings.Contains(line, enrollmentToken) {
			t.Fatalf("the token leaves the agent: %s", line)
		}
	}

	if journal := b.journal(); strings.Contains(journal, enrollmentToken) {
		t.Fatalf("the token is in the journal:\n%s", journal)
	}

	if !strings.Contains(b.journal(), "server enrolled") {
		t.Fatalf("the enrolment is not journalled:\n%s", b.journal())
	}
}

// A platform that echoes the token back in its refusal: the message the app displays says [secret], and so does the journal.
func TestARefusalThatCarriesTheTokenIsRedacted(t *testing.T) {
	b := newBench(t, false)
	b.platform.echoRefusals()

	answer := serveResolved(t, b, enrollRequests(b)...)[0]
	if answer.OK {
		t.Fatal("a refused token enrolled the server")
	}

	if answer.Error.Code != contract.ErrorEntitlementRequired {
		t.Fatalf("erreur = %+v", answer.Error)
	}

	if strings.Contains(answer.Error.Message, enrollmentToken) {
		t.Fatalf("the token is in the refusal: %s", answer.Error.Message)
	}

	if !strings.Contains(answer.Error.Message, "[secret]") {
		t.Fatalf("the refusal masks nothing: %s", answer.Error.Message)
	}

	if platform.Enrolled(b.fake, platform.DefaultTokenPath) {
		t.Fatal("a refused exchange wrote a server token")
	}
}

// A server whose token was lost or revoked answers restricted, and enrolling again is the gesture that repairs it: the console is not the only way back.
func TestARestrictedServerEnrolsAgainWithoutTheConsole(t *testing.T) {
	b := newBench(t, true)
	b.platform.allow(laptop)
	b.fake.Files[platform.DefaultTokenPath] = []byte("jeton-revoque\n")

	requests := append(enrollRequests(b), `{"id":3,"cmd":"keys.sync","params":{}}`)

	answers := serve(t, b, contract.EntitlementRestricted, requests...)
	if len(answers) != 2 {
		t.Fatalf("%d answer(s)", len(answers))
	}

	if !answers[0].OK {
		t.Fatalf("a restricted server cannot re-enrol: %v", answers[0].Error)
	}

	if err := contract.Validate("EnrollResult", decode(t, answers[0].Result)); err != nil {
		t.Fatalf("result outside the contract: %v", err)
	}

	token, err := platform.LoadToken(b.fake, platform.DefaultTokenPath)
	if err != nil || token != "jeton-de-serveur" {
		t.Fatalf("jeton = %q, err = %v", token, err)
	}

	if answers[1].OK || answers[1].Error.Code != contract.ErrorEntitlementRequired {
		t.Fatalf("restricted mode opens beyond enroll: %+v", answers[1])
	}
}

// The one command a binary without a server token opens beyond hello, ping and diag.
// The state is the one a release build resolves without a token, named here: a development build resolves its own entitlement whatever the disk holds.
func TestOnlyEnrollOpensOnABinaryWithoutAServerToken(t *testing.T) {
	b := newBench(t, false)
	unenrolled := func() entitlement.State { return entitlement.State{Entitlement: contract.EntitlementRestricted} }

	refused := session(t, b, unenrolled, `{"id":2,"cmd":"keys.sync","params":{}}`)[0]
	if refused.OK || refused.Error.Code != contract.ErrorEntitlementRequired {
		t.Fatalf("keys.sync = %+v", refused)
	}

	if answer := session(t, b, unenrolled, enrollRequests(b)...)[0]; !answer.OK {
		t.Fatalf("enroll refused on an unenrolled binary: %v", answer.Error)
	}
}

func TestEnrollRefusesASecretLineThatIsNotOne(t *testing.T) {
	for _, line := range []string{`{"platform_url":"https://app.pupitre.studio/api/v1"}`, `{"enrollment_token":""}`} {
		b := newBench(t, false)

		answer := serveResolved(t, b,
			`{"id":2,"cmd":"enroll","params":{"platform_url":"`+b.server.URL+`","secrets_stdin":true}}`,
			line,
		)[0]

		if answer.OK || answer.Error.Code != contract.ErrorBadRequest || answer.Error.Fix == "" {
			t.Fatalf("line %s: answer = %+v", line, answer)
		}

		if len(b.platform.traded) != 0 {
			t.Fatalf("line %s: an exchange took place", line)
		}
	}
}

// The console shows the modules at the end of an installation rather than at
// the daemon's next turn, five minutes later.
func TestPlatformSyncReadsTheStateAndBeatsAtOnce(t *testing.T) {
	b := newBench(t, true)
	b.platform.allow(laptop)

	answer := serve(t, b, contract.EntitlementValid, `{"id":2,"cmd":"platform.sync","params":{}}`)[0]
	if !answer.OK {
		t.Fatalf("answer = %+v", answer)
	}

	var synced struct {
		SyncedAt    string `json:"synced_at"`
		HeartbeatAt string `json:"heartbeat_at"`
	}
	if err := json.Unmarshal(answer.Result, &synced); err != nil {
		t.Fatal(err)
	}

	if synced.SyncedAt != noon.Format(time.RFC3339) || synced.HeartbeatAt == "" {
		t.Fatalf("synced = %+v", synced)
	}

	if len(b.platform.beats) != 1 {
		t.Fatalf("%d heartbeat(s), want one", len(b.platform.beats))
	}
}

// A server whose usage right the platform has not confirmed is exactly the one
// that needs to ask again: the contract leaves this command open for it.
func TestPlatformSyncStaysOpenInRestrictedMode(t *testing.T) {
	b := newBench(t, true)
	b.platform.allow(laptop)

	answer := serve(t, b, contract.EntitlementRestricted, `{"id":2,"cmd":"platform.sync","params":{}}`)[0]
	if !answer.OK {
		t.Fatalf("answer = %+v", answer)
	}
}

func TestPlatformSyncSaysWhenTheServerIsNotEnrolled(t *testing.T) {
	b := newBench(t, false)

	answer := serve(t, b, contract.EntitlementValid, `{"id":2,"cmd":"platform.sync","params":{}}`)[0]
	if answer.OK || answer.Error.Code != contract.ErrorBadRequest || answer.Error.Fix == "" {
		t.Fatalf("answer = %+v", answer)
	}
}
