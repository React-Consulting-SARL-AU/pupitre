package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/release"
	"pupitre.studio/agent/internal/selfupdate"
)

func noEnvironment(string) string { return "" }

func environmentOf(values map[string]string) environment {
	return func(name string) string { return values[name] }
}

func execute(t *testing.T, env environment, args ...string) (int, string, string) {
	t.Helper()

	stdout := &bytes.Buffer{}
	stderr := &bytes.Buffer{}

	code := run(args, stdout, stderr, env)

	return code, stdout.String(), stderr.String()
}

func binaryAt(t *testing.T, name string, content []byte) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, content, 0o755); err != nil {
		t.Fatalf("binaire de test : %v", err)
	}

	return path
}

func signingEnvironment(t *testing.T) (environment, string) {
	t.Helper()

	public, private, err := release.GenerateKeyPair()
	if err != nil {
		t.Fatalf("paire de test : %v", err)
	}

	return environmentOf(map[string]string{privateKeyVariable: private}), public
}

func TestKeygenWritesThePairToStandardOutputOnly(t *testing.T) {
	code, stdout, _ := execute(t, noEnvironment, "keygen")
	if code != 0 {
		t.Fatalf("code = %d", code)
	}

	lines := strings.Fields(stdout)
	if len(lines) != 4 || lines[0] != "public" || lines[2] != "private" {
		t.Fatalf("sortie = %q", stdout)
	}

	private, err := release.ParsePrivateKey(lines[3])
	if err != nil {
		t.Fatalf("private key: %v", err)
	}

	if release.PublicKeyOf(private) != lines[1] {
		t.Fatal("the pair does not hold together")
	}
}

func TestPublicKeyDerivesTheFlagTheReleaseBuildInjects(t *testing.T) {
	env, public := signingEnvironment(t)

	code, stdout, stderr := execute(t, env, "public-key")
	if code != 0 {
		t.Fatalf("code = %d, stderr = %s", code, stderr)
	}

	if strings.TrimSpace(stdout) != public {
		t.Fatalf("public key = %q", stdout)
	}
}

func TestSigningStopsWithoutTheSecret(t *testing.T) {
	binary := binaryAt(t, "pupitred-linux-amd64", []byte("pupitred"))

	code, _, stderr := execute(t, noEnvironment, "sign", "--version=1.4.2", binary)
	if code == 0 {
		t.Fatal("signed without a key")
	}

	if !strings.Contains(stderr, privateKeyVariable) {
		t.Fatalf("stderr = %s", stderr)
	}
}

func TestSignWritesPublicationsTheAgentAccepts(t *testing.T) {
	env, public := signingEnvironment(t)
	directory := t.TempDir()

	amd64 := filepath.Join(directory, "pupitred-linux-amd64")
	arm64 := filepath.Join(directory, "pupitred-linux-arm64")

	for path, content := range map[string][]byte{amd64: []byte("binaire amd64"), arm64: []byte("binaire arm64")} {
		if err := os.WriteFile(path, content, 0o755); err != nil {
			t.Fatalf("binaire de test : %v", err)
		}
	}

	out := filepath.Join(directory, "publications.json")

	code, _, stderr := execute(t, env, "sign", "--version=1.4.2", "--channel=beta", "--out="+out, amd64, arm64)
	if code != 0 {
		t.Fatalf("code = %d, stderr = %s", code, stderr)
	}

	content, err := os.ReadFile(out)
	if err != nil {
		t.Fatalf("publications : %v", err)
	}

	var publications []release.Publication
	if err := json.Unmarshal(content, &publications); err != nil {
		t.Fatalf("publications illisibles : %v", err)
	}

	if len(publications) != 2 {
		t.Fatalf("%d publications", len(publications))
	}

	key, err := selfupdate.ParsePublicKey(public)
	if err != nil {
		t.Fatalf("public key: %v", err)
	}

	for _, publication := range publications {
		signature, err := selfupdate.DecodeSignature(publication.Signature)
		if err != nil {
			t.Fatalf("%s : %v", publication.Arch, err)
		}

		if !selfupdate.Verify(key, publication.Version, publication.Arch, publication.SHA256, signature) {
			t.Errorf("%s: signature refused by the agent", publication.Arch)
		}
	}

	if publications[0].Arch != "amd64" || publications[1].Arch != "arm64" {
		t.Fatalf("architectures = %s, %s", publications[0].Arch, publications[1].Arch)
	}
}

func TestSignRefusesABinaryWhoseNameDoesNotSayItsArchitecture(t *testing.T) {
	env, _ := signingEnvironment(t)
	binary := binaryAt(t, "pupitred", []byte("pupitred"))

	if code, _, _ := execute(t, env, "sign", "--version=1.4.2", binary); code == 0 {
		t.Fatal("binary accepted")
	}
}

func TestAnUnknownSubcommandExplainsItself(t *testing.T) {
	code, _, stderr := execute(t, noEnvironment, "upload")
	if code != 2 || !strings.Contains(stderr, "usage:") {
		t.Fatalf("code = %d, stderr = %s", code, stderr)
	}
}
