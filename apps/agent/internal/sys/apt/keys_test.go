package apt_test

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sys/apt"
)

const (
	keyURL  = "https://pkg.example.org/repo.asc"
	keyring = "/usr/share/keyrings/example.gpg"
)

func TestDearmorKeyLeavesOnlyTheKeyringBehind(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	if err := apt.DearmorKey(ctx, keyURL, keyring); err != nil {
		t.Fatal(err)
	}

	if len(fake.Files[keyring]) == 0 {
		t.Fatalf("the keyring must be written, files: %v", fake.Files)
	}

	for path := range fake.Files {
		if strings.HasPrefix(path, "/tmp/") || strings.HasSuffix(path, ".asc") {
			t.Fatalf("the armoured copy must not stay behind: %s", path)
		}
	}

	commands := strings.Join(fake.Commands(), "\n")
	for _, want := range []string{
		"curl -fsSL --proto =https --tlsv1.2 -o " + keyring + ".asc " + keyURL,
		"gpg --batch --yes --dearmor -o " + keyring + " " + keyring + ".asc",
	} {
		if !strings.Contains(commands, want) {
			t.Errorf("command %q not run:\n%s", want, commands)
		}
	}
}

func TestDownloadKeyPinsTheTransport(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	if err := apt.DownloadKey(ctx, keyURL, "/etc/apt/keyrings/example.asc"); err != nil {
		t.Fatal(err)
	}

	if got := fake.Commands()[0]; got != "curl -fsSL --proto =https --tlsv1.2 -o /etc/apt/keyrings/example.asc "+keyURL {
		t.Fatalf("curl argv = %q", got)
	}
}

func TestDearmorKeyStopsAtTheFirstRefusal(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailProgram("gpg", "gpg: no valid OpenPGP data found.")
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	if err := apt.DearmorKey(ctx, keyURL, keyring); err == nil {
		t.Fatal("a key gpg refuses must fail the step")
	}

	if _, present := fake.Files[keyring]; present {
		t.Fatal("no keyring must be written from a refused key")
	}
}
