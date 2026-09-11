package selfupdate_test

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/platform"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/selfupdate"
)

const (
	binaryPath   = "/usr/local/bin/pupitred"
	tokenPath    = "/etc/pupitre/server.token"
	unit         = "pupitred"
	olderAgent   = "0.9.0"
	currentAgent = "1.0.0"
	nextAgent    = "1.1.0"
	arch         = "amd64"
)

var (
	oldBinary = []byte("\x7fELF ancien agent")
	newBinary = []byte("\x7fELF nouvel agent")
)

// A fake platform that answers the three calls an upgrade makes: the state of the server, the metadata of a version, and the binary itself.
type bench struct {
	fake           *modtest.FakeSys
	options        selfupdate.Options
	private        ed25519.PrivateKey
	signature      string
	signedVersion  string
	announced      string
	served         []byte
	status         int
	metadataStatus int
	stateStatus    int
	target         string
	minimum        string
	requested      []string
}

func newBench(t *testing.T) *bench {
	t.Helper()

	public, private, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("test key: %v", err)
	}

	fake := modtest.NewFakeSys()
	fake.Files[binaryPath] = append([]byte(nil), oldBinary...)
	fake.Files[tokenPath] = []byte("jeton-de-serveur\n")
	fake.Units[unit] = modtest.UnitActive
	fake.Replies[binaryPath+" serve"] = hello(true, nextAgent, "")

	b := &bench{
		fake:           fake,
		private:        private,
		served:         newBinary,
		status:         http.StatusOK,
		metadataStatus: http.StatusOK,
		stateStatus:    http.StatusOK,
		target:         nextAgent,
	}

	server := httptest.NewServer(http.HandlerFunc(b.answer))
	t.Cleanup(server.Close)

	b.signature = sign(private, nextAgent, arch, selfupdate.Fingerprint(newBinary))
	b.options = selfupdate.Options{
		Sys:        fake,
		Version:    currentAgent,
		Arch:       arch,
		BinaryPath: binaryPath,
		TokenPath:  tokenPath,
		Unit:       unit,
		Platform:   platform.Client{BaseURL: server.URL},
		PublicKey:  public,
	}

	return b
}

func (b *bench) answer(w http.ResponseWriter, r *http.Request) {
	b.requested = append(b.requested, r.URL.Path)

	switch {
	case r.URL.Path == "/agent/state":
		if b.stateStatus != http.StatusOK {
			w.WriteHeader(b.stateStatus)

			return
		}

		json.NewEncoder(w).Encode(map[string]string{
			"target_version":  b.target,
			"minimum_version": b.minimum,
		})
	case strings.HasSuffix(r.URL.Path, "/metadata"):
		if b.metadataStatus != http.StatusOK {
			w.WriteHeader(b.metadataStatus)

			return
		}

		version := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/agent/release/"), "/metadata")

		json.NewEncoder(w).Encode(map[string]string{
			"version":   version,
			"arch":      arch,
			"sha256":    b.fingerprint(),
			"signature": b.signatureFor(version),
			"channel":   "stable",
		})
	default:
		if b.status != http.StatusOK {
			w.WriteHeader(b.status)

			return
		}

		w.Write(b.served)
	}
}

func (b *bench) fingerprint() string {
	if b.announced != "" {
		return b.announced
	}

	return selfupdate.Fingerprint(b.served)
}

func (b *bench) signatureFor(version string) string {
	if b.signedVersion != "" {
		version = b.signedVersion
	}

	return sign(b.private, version, arch, selfupdate.Fingerprint(newBinary))
}

// The default gesture: a version and nothing else, the platform says the rest.
func (b *bench) upgrade(t *testing.T, version string) (selfupdate.Result, error) {
	t.Helper()

	return selfupdate.New(b.options).Upgrade(selfupdate.Request{Version: version})
}

func (b *bench) upgradeWith(t *testing.T, request selfupdate.Request) (selfupdate.Result, error) {
	t.Helper()

	return selfupdate.New(b.options).Upgrade(request)
}

func sign(private ed25519.PrivateKey, version, architecture, fingerprint string) string {
	return base64.StdEncoding.EncodeToString(ed25519.Sign(private, selfupdate.SignedMessage(version, architecture, fingerprint)))
}

func hello(ok bool, version, code string) string {
	if ok {
		return `{"id":1,"ok":true,"result":{"agent_version":"` + version + `","protocol":1,"entitlement":"restricted","capabilities":["hello"]}}` + "\n"
	}

	return `{"id":1,"ok":false,"error":{"code":"` + code + `","message":"refus de test"}}` + "\n"
}

func codeOf(t *testing.T, err error) contract.ErrorCode {
	t.Helper()

	failure, ok := err.(*protocol.Error)
	if !ok {
		t.Fatalf("expected a protocol error, got %T: %v", err, err)
	}

	return failure.Code
}

func TestUpgradeInstallsASignedBinaryAndRestartsTheUnit(t *testing.T) {
	b := newBench(t)

	result, err := b.upgrade(t, nextAgent)
	if err != nil {
		t.Fatalf("Upgrade: %v", err)
	}

	if result.PreviousVersion != currentAgent || result.Version != nextAgent || !result.Restarting {
		t.Fatalf("result = %+v", result)
	}

	if string(b.fake.Files[binaryPath]) != string(newBinary) {
		t.Fatalf("binaire en place : %q", b.fake.Files[binaryPath])
	}

	if b.fake.Restarts[unit] != 1 {
		t.Fatalf("restarts of %s: %d", unit, b.fake.Restarts[unit])
	}
}

func TestUpgradeRefusesABinaryWhoseSignatureDoesNotMatch(t *testing.T) {
	b := newBench(t)
	_, other, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("test key: %v", err)
	}
	b.private = other

	before := snapshot(b.fake)

	_, err = b.upgrade(t, nextAgent)
	if code := codeOf(t, err); code != contract.ErrorBadSignature {
		t.Fatalf("code = %s, erreur = %v", code, err)
	}

	assertUntouched(t, b, before)
}

func TestUpgradeRefusesABinaryThatDoesNotMatchItsFingerprint(t *testing.T) {
	b := newBench(t)
	b.served = []byte("\x7fELF un autre binaire")

	before := snapshot(b.fake)

	_, err := b.upgrade(t, nextAgent)
	if code := codeOf(t, err); code != contract.ErrorBadSignature {
		t.Fatalf("code = %s, erreur = %v", code, err)
	}

	assertUntouched(t, b, before)
}

// The same publisher, the same binary, another version: a signature that travels with the wrong version is worth nothing.
func TestUpgradeRefusesASignatureIssuedForAnotherVersion(t *testing.T) {
	b := newBench(t)
	b.signedVersion = nextAgent

	before := snapshot(b.fake)

	_, err := b.upgrade(t, "2.0.0")
	if code := codeOf(t, err); code != contract.ErrorBadSignature {
		t.Fatalf("code = %s, erreur = %v", code, err)
	}

	assertUntouched(t, b, before)
}

func TestUpgradeRefusesASignatureIssuedForAnotherArchitecture(t *testing.T) {
	b := newBench(t)
	b.options.Arch = "arm64"

	before := snapshot(b.fake)

	_, err := b.upgrade(t, nextAgent)
	if code := codeOf(t, err); code != contract.ErrorBadSignature {
		t.Fatalf("code = %s, erreur = %v", code, err)
	}

	assertUntouched(t, b, before)
}

func TestUpgradeRefusesWithoutAnEmbeddedPublicKey(t *testing.T) {
	b := newBench(t)
	b.options.PublicKey = nil

	before := snapshot(b.fake)

	_, err := b.upgrade(t, nextAgent)
	if code := codeOf(t, err); code != contract.ErrorBadSignature {
		t.Fatalf("code = %s, erreur = %v", code, err)
	}

	assertUntouched(t, b, before)
}

func TestUpgradeRestoresThePreviousBinaryWhenTheNewOneStaysSilent(t *testing.T) {
	b := newBench(t)
	b.fake.Replies[binaryPath+" serve"] = ""

	_, err := b.upgrade(t, nextAgent)
	if code := codeOf(t, err); code != contract.ErrorInternal {
		t.Fatalf("code = %s, erreur = %v", code, err)
	}

	if string(b.fake.Files[binaryPath]) != string(oldBinary) {
		t.Fatalf("binaire en place : %q", b.fake.Files[binaryPath])
	}

	if b.fake.Restarts[unit] != 2 {
		t.Fatalf("restarts of %s: %d", unit, b.fake.Restarts[unit])
	}

	if !strings.Contains(err.Error(), currentAgent) {
		t.Fatalf("the error does not name the restored version: %v", err)
	}
}

func TestUpgradeRestoresThePreviousBinaryWhenTheNewOneRefusesHello(t *testing.T) {
	b := newBench(t)
	b.fake.Replies[binaryPath+" serve"] = hello(false, "", "protocol_mismatch")

	_, err := b.upgrade(t, nextAgent)
	if code := codeOf(t, err); code != contract.ErrorInternal {
		t.Fatalf("code = %s, erreur = %v", code, err)
	}

	if string(b.fake.Files[binaryPath]) != string(oldBinary) {
		t.Fatalf("binaire en place : %q", b.fake.Files[binaryPath])
	}
}

func TestUpgradeRestoresThePreviousBinaryWhenTheNewOneCrashes(t *testing.T) {
	b := newBench(t)
	b.fake.FailProgram(binaryPath, "panic: runtime error")

	_, err := b.upgrade(t, nextAgent)
	if code := codeOf(t, err); code != contract.ErrorInternal {
		t.Fatalf("code = %s, erreur = %v", code, err)
	}

	if string(b.fake.Files[binaryPath]) != string(oldBinary) {
		t.Fatalf("binaire en place : %q", b.fake.Files[binaryPath])
	}
}

func TestUpgradeLeavesTheBinaryAloneWhenItIsAlreadyTheVersionAsked(t *testing.T) {
	b := newBench(t)
	b.fake.Files[binaryPath] = append([]byte(nil), newBinary...)

	result, err := b.upgrade(t, nextAgent)
	if err != nil {
		t.Fatalf("Upgrade: %v", err)
	}

	if result.Restarting || b.fake.Restarts[unit] != 0 {
		t.Fatalf("result = %+v, restarts = %d", result, b.fake.Restarts[unit])
	}
}

func TestUpgradeSkipsTheRestartWhenTheUnitIsAbsent(t *testing.T) {
	b := newBench(t)
	delete(b.fake.Units, unit)

	result, err := b.upgrade(t, nextAgent)
	if err != nil {
		t.Fatalf("Upgrade: %v", err)
	}

	if result.Restarting || string(b.fake.Files[binaryPath]) != string(newBinary) {
		t.Fatalf("result = %+v", result)
	}
}

func TestUpgradeRefusesAVersionThePlatformDoesNotPublish(t *testing.T) {
	b := newBench(t)
	b.status = http.StatusNotFound
	b.metadataStatus = http.StatusNotFound

	before := snapshot(b.fake)

	_, err := b.upgrade(t, "9.9.9")
	if code := codeOf(t, err); code != contract.ErrorBadRequest {
		t.Fatalf("code = %s, erreur = %v", code, err)
	}

	assertUntouched(t, b, before)
}

func TestUpgradeRefusesWithoutAServerToken(t *testing.T) {
	b := newBench(t)
	delete(b.fake.Files, tokenPath)

	before := snapshot(b.fake)

	_, err := b.upgrade(t, nextAgent)
	if code := codeOf(t, err); code != contract.ErrorBadRequest {
		t.Fatalf("code = %s, erreur = %v", code, err)
	}

	if len(b.requested) != 0 {
		t.Fatalf("the platform was called without a token: %v", b.requested)
	}

	assertUntouched(t, b, before)
}

func TestUpgradeWithoutAVersionTakesTheTargetOfThePlatform(t *testing.T) {
	b := newBench(t)

	result, err := b.upgrade(t, "")
	if err != nil {
		t.Fatalf("Upgrade: %v", err)
	}

	if result.Version != nextAgent {
		t.Fatalf("result = %+v", result)
	}

	if len(b.requested) != 3 || b.requested[0] != "/agent/state" || b.requested[2] != "/agent/release/"+nextAgent {
		t.Fatalf("appels : %v", b.requested)
	}
}

// The whole point: the app hands over a version, nothing else, and the platform's own answer carries the fingerprint and the signature.
func TestUpgradeTakesTheFingerprintFromThePlatformWithoutASignatureParameter(t *testing.T) {
	b := newBench(t)

	result, err := b.upgrade(t, nextAgent)
	if err != nil {
		t.Fatalf("Upgrade: %v", err)
	}

	if result.Version != nextAgent || string(b.fake.Files[binaryPath]) != string(newBinary) {
		t.Fatalf("result = %+v, binary = %q", result, b.fake.Files[binaryPath])
	}

	if !contains(b.requested, "/agent/release/"+nextAgent+"/metadata") {
		t.Fatalf("the platform metadata was not read: %v", b.requested)
	}
}

func TestUpgradeRefusesABinaryWhoseFingerprintIsNotTheAnnouncedOne(t *testing.T) {
	b := newBench(t)
	b.announced = strings.Repeat("a", 64)

	before := snapshot(b.fake)

	_, err := b.upgrade(t, nextAgent)
	if code := codeOf(t, err); code != contract.ErrorBadSignature {
		t.Fatalf("code = %s, erreur = %v", code, err)
	}

	assertUntouched(t, b, before)
}

// A signature stays valid forever, so nothing but the floor stops an old and faulty version from coming back.
func TestUpgradeRefusesAVersionOlderThanTheRunningOne(t *testing.T) {
	b := newBench(t)

	before := snapshot(b.fake)

	_, err := b.upgrade(t, olderAgent)
	if code := codeOf(t, err); code != contract.ErrorDowngradeRefused {
		t.Fatalf("code = %s, erreur = %v", code, err)
	}

	if contains(b.requested, "/agent/release/"+olderAgent) {
		t.Fatalf("the binary was downloaded despite the refusal: %v", b.requested)
	}

	assertUntouched(t, b, before)
}

// "dev" sorts above every number, and an agent built that way must still take the version the platform publishes.
func TestADevBuildIsNoFloor(t *testing.T) {
	b := newBench(t)
	b.options.Version = "dev"

	if _, err := b.upgrade(t, olderAgent); err != nil {
		t.Fatalf("Upgrade: %v", err)
	}

	if string(b.fake.Files[binaryPath]) != string(newBinary) {
		t.Fatalf("binary in place: %q", b.fake.Files[binaryPath])
	}
}

func TestADevBuildStillHoldsTheFloorThePlatformRemembers(t *testing.T) {
	b := newBench(t)
	b.options.Version = "dev"
	b.minimum = currentAgent

	_, err := b.upgrade(t, olderAgent)
	if code := codeOf(t, err); code != contract.ErrorDowngradeRefused {
		t.Fatalf("code = %s, err = %v", code, err)
	}
}

func TestUpgradeRefusesAVersionBelowTheFloorThePlatformRemembers(t *testing.T) {
	b := newBench(t)
	b.minimum = "1.2.0"

	before := snapshot(b.fake)

	_, err := b.upgrade(t, nextAgent)
	if code := codeOf(t, err); code != contract.ErrorDowngradeRefused {
		t.Fatalf("code = %s, erreur = %v", code, err)
	}

	failure, _ := err.(*protocol.Error)
	if failure.Fix == "" || !strings.Contains(failure.Fix, "allow_downgrade") {
		t.Fatalf("the refusal does not say how to override it: %+v", failure)
	}

	assertUntouched(t, b, before)
}

// The owner asked for it in so many words; the signature is still checked.
func TestUpgradeInstallsAnOlderVersionWhenTheOwnerAllowsIt(t *testing.T) {
	b := newBench(t)

	_, err := b.upgradeWith(t, selfupdate.Request{Version: olderAgent, AllowDowngrade: true})
	if err != nil {
		t.Fatalf("Upgrade: %v", err)
	}

	if string(b.fake.Files[binaryPath]) != string(newBinary) {
		t.Fatalf("binaire en place : %q", b.fake.Files[binaryPath])
	}
}

func TestUpgradeRefusesADowngradeEvenWhenThePlatformIsSilent(t *testing.T) {
	b := newBench(t)
	b.stateStatus = http.StatusInternalServerError

	before := snapshot(b.fake)

	_, err := b.upgrade(t, olderAgent)
	if code := codeOf(t, err); code != contract.ErrorDowngradeRefused {
		t.Fatalf("code = %s, erreur = %v", code, err)
	}

	assertUntouched(t, b, before)
}

// A platform out of reach must not leave the agent stuck on a broken version: the signature of the parameters is the way back.
func TestUpgradeFallsBackOnTheSignatureOfTheParametersWhenTheMetadataIsUnreachable(t *testing.T) {
	b := newBench(t)
	b.metadataStatus = http.StatusInternalServerError

	result, err := b.upgradeWith(t, selfupdate.Request{Version: nextAgent, Signature: b.signature})
	if err != nil {
		t.Fatalf("Upgrade: %v", err)
	}

	if result.Version != nextAgent || string(b.fake.Files[binaryPath]) != string(newBinary) {
		t.Fatalf("result = %+v, binary = %q", result, b.fake.Files[binaryPath])
	}
}

func TestUpgradeRefusesWhenNeitherThePlatformNorTheCallerHasASignature(t *testing.T) {
	b := newBench(t)
	b.metadataStatus = http.StatusInternalServerError

	before := snapshot(b.fake)

	_, err := b.upgrade(t, nextAgent)
	if code := codeOf(t, err); code != contract.ErrorInternal {
		t.Fatalf("code = %s, erreur = %v", code, err)
	}

	assertUntouched(t, b, before)
}

func contains(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}

	return false
}

func snapshot(fake *modtest.FakeSys) map[string]string {
	files := make(map[string]string, len(fake.Files))
	for path, content := range fake.Files {
		files[path] = string(content)
	}

	return files
}

// A refused binary leaves nothing behind: not the file it would have become, not a temporary one, not a restart.
func assertUntouched(t *testing.T, b *bench, before map[string]string) {
	t.Helper()

	after := snapshot(b.fake)
	if len(after) != len(before) {
		t.Fatalf("files before %v, after %v", keys(before), keys(after))
	}

	for path, content := range before {
		if after[path] != content {
			t.Fatalf("%s changed: %q", path, after[path])
		}
	}

	if b.fake.Restarts[unit] != 0 {
		t.Fatalf("restarts of %s: %d", unit, b.fake.Restarts[unit])
	}
}

func keys(files map[string]string) []string {
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}

	return names
}
