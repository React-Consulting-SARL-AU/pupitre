package cloudflared

import (
	"errors"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/registry"
)

const (
	tunnel = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b"
	domain = "flyleaf.dev"
)

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Module: "exposure.cloudflare"})
}

func project(name, hostname string, port int) registry.Project {
	return registry.Project{
		Name: name,
		Processes: []registry.Process{{
			ID:     name,
			Host:   "127.0.0.1",
			Port:   port,
			Routes: []registry.Route{{Label: "web", Port: port, Hostname: hostname}},
		}},
	}
}

func TestTheIngressNamesTheTunnelItsCredentialsAndEndsOnA404(t *testing.T) {
	ingress := string(Ingress(tunnel, domain, []registry.Project{
		project("web", "app."+domain, 3000),
		project("elsewhere", "app.other.dev", 3001),
	}))

	for _, want := range []string{
		"tunnel: " + tunnel + "\n",
		"credentials-file: " + CredentialsPath + "\n",
		"  - hostname: app." + domain + "\n    service: http://127.0.0.1:3000\n",
		"      httpHostHeader: 127.0.0.1:3000\n",
	} {
		if !strings.Contains(ingress, want) {
			t.Errorf("ingress lacks %q:\n%s", want, ingress)
		}
	}

	if strings.Contains(ingress, "other.dev") {
		t.Fatalf("a name outside the domain is not the tunnel's to route:\n%s", ingress)
	}

	if !strings.HasSuffix(ingress, "  - service: http_status:404\n") {
		t.Fatalf("the ingress must end on the catch-all:\n%s", ingress)
	}
}

func TestAnIngressWithoutProjectsStillAnswers(t *testing.T) {
	ingress := string(Ingress(tunnel, domain, nil))

	if strings.Contains(ingress, "hostname:") || !strings.Contains(ingress, "ingress:\n  - service: http_status:404\n") {
		t.Fatalf("ingress = %s", ingress)
	}
}

func TestCredentialsAreWrittenForRootAloneAndReadBack(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake)

	if got := Recorded(ctx); got != (Credentials{}) {
		t.Fatalf("nothing written yet, recorded = %+v", got)
	}

	written := Credentials{AccountTag: "0123456789abcdef0123456789abcdef", TunnelID: tunnel, TunnelSecret: "s3cret-de-test"}
	if err := WriteCredentials(ctx, written); err != nil {
		t.Fatal(err)
	}

	if fake.Modes[CredentialsPath] != 0o600 {
		t.Fatalf("%s mode = %o, want 0600", CredentialsPath, fake.Modes[CredentialsPath])
	}

	if got := Recorded(ctx); got != written {
		t.Fatalf("recorded = %+v", got)
	}

	fake.Files[CredentialsPath] = []byte("{not json")
	if got := Recorded(ctx); got != (Credentials{}) {
		t.Fatalf("an unreadable file records nothing, got %+v", got)
	}
}

func TestInstallAddsThePinnedRepositoryThenThePackage(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake)

	if err := Install(ctx); err != nil {
		t.Fatal(err)
	}

	if len(fake.Files[KeyringPath]) == 0 || string(fake.Files[SourcePath]) != SourceLine {
		t.Fatalf("keyring %d byte(s), source %q", len(fake.Files[KeyringPath]), fake.Files[SourcePath])
	}

	if !Installed(ctx) {
		t.Fatal("the package must be installed")
	}

	if version, err := Version(ctx); err != nil || version == "" {
		t.Fatalf("version = %q, %v", version, err)
	}

	fetched := 0
	if err := Install(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	for _, command := range fake.Commands() {
		if strings.HasPrefix(command, "curl ") {
			fetched++
		}
	}

	if fetched != 1 {
		t.Fatalf("a keyring already there is not fetched again, fetched %d time(s)", fetched)
	}
}

func TestAKeyCloudflareDoesNotSignWithIsRefused(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Signers[keyURL] = []string{"1111111111111111111111111111111111111111"}
	ctx := newContext(t, fake)

	if err := Install(ctx); err == nil {
		t.Fatal("a forged key must stop the install")
	}

	if _, kept := fake.Files[KeyringPath]; kept || Installed(ctx) {
		t.Fatal("neither the key nor the package may stay")
	}
}

func TestAStartFailureNamesTheTunnelCloudflareNoLongerHolds(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake)
	failed := errors.New("Job for cloudflared.service failed")

	if got := StartFailure(ctx, failed); got != failed {
		t.Fatalf("a silent journal leaves the error as it was: %v", got)
	}

	fake.Answer("journalctl", "ERR Couldn't start tunnel error=\"no route to host\"")
	if got := StartFailure(ctx, failed); !strings.Contains(got.Error(), "no route to host") {
		t.Fatalf("what the daemon said must be carried: %v", got)
	}

	fake.Answer("journalctl", `ERR Register tunnel error from server side error="Unauthorized: Tunnel not found"`)
	if got := StartFailure(ctx, failed); strings.Contains(got.Error(), "Unauthorized") {
		t.Fatalf("an unknown tunnel is said in words the client acts on: %v", got)
	}
}

func TestOnlyARefusalNothingAnsweredIsAVerdict(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Units[Unit] = modtest.UnitInactive
	ctx := newContext(t, fake)

	fake.Answer("journalctl", "ERR Tunnel not found\nINF Registered tunnel connection connIndex=0")
	if err := Registered(ctx); err != nil {
		t.Fatalf("a connection after the refusal is a tunnel that exists: %v", err)
	}

	fake.Answer("journalctl", "INF Registered tunnel connection connIndex=0\nERR Tunnel not found")
	if err := Registered(ctx); err == nil {
		t.Fatal("a refusal nothing answered is the verdict")
	}

	fake.Answer("journalctl", "INF Retrying connection in 4s\nINF Retrying connection in 8s\nINF Retrying connection in 16s")
	serving, said := Serving(ctx)
	if serving || said != "INF Retrying connection in 8s / INF Retrying connection in 16s" {
		t.Fatalf("serving = %v, said = %q: only the last words are kept", serving, said)
	}
}
