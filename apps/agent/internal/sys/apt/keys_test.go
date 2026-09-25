package apt_test

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sys/apt"
)

const (
	keyURL      = "https://pkg.example.org/repo.asc"
	keyring     = "/usr/share/keyrings/example.gpg"
	fingerprint = "9DC858229FC7DD38854AE2D88D81803C0EBFCD88"
	forged      = "1111111111111111111111111111111111111111"
)

func pinned(t *testing.T) *modtest.FakeSys {
	t.Helper()

	apt.Pins[keyURL] = []string{fingerprint}
	t.Cleanup(func() { delete(apt.Pins, keyURL) })

	return modtest.NewFakeSys()
}

func TestDearmorKeyLeavesOnlyTheKeyringBehind(t *testing.T) {
	fake := pinned(t)
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
		"-o " + keyring + ".asc " + keyURL,
		"gpg --batch --with-colons --show-keys " + keyring + ".asc",
		"gpg --batch --yes --dearmor -o " + keyring + " " + keyring + ".asc",
	} {
		if !strings.Contains(commands, want) {
			t.Errorf("command %q not run:\n%s", want, commands)
		}
	}
}

func TestDownloadKeyPinsTheTransportAndBoundsTheWait(t *testing.T) {
	fake := pinned(t)
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	if err := apt.DownloadKey(ctx, keyURL, "/etc/apt/keyrings/example.asc"); err != nil {
		t.Fatal(err)
	}

	got := fake.Commands()[0]

	for _, want := range []string{"curl -fsSL --proto =https --tlsv1.2 ", "--connect-timeout ", "--max-time ", "-o /etc/apt/keyrings/example.asc " + keyURL} {
		if !strings.Contains(got, want) {
			t.Fatalf("curl argv = %q, want %q in it", got, want)
		}
	}
}

func TestAKeyWithNoPinIsRefusedBeforeItIsFetched(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	err := apt.DownloadKey(ctx, keyURL, "/etc/apt/keyrings/example.asc")
	if err == nil || !strings.Contains(err.Error(), keyURL) {
		t.Fatalf("download = %v, want the unpinned URL named", err)
	}

	if len(fake.Commands()) != 0 {
		t.Fatalf("nothing may be fetched for an unpinned key: %v", fake.Commands())
	}
}

func TestAKeyThatIsNotThePinnedOneIsRefusedAndRemoved(t *testing.T) {
	for name, served := range map[string][]string{
		"forged":        {forged},
		"one key added": {fingerprint, forged},
	} {
		t.Run(name, func(t *testing.T) {
			fake := pinned(t)
			fake.Signers[keyURL] = served
			ctx := modtest.NewContext(t, fake, modtest.Options{})

			err := apt.DownloadKey(ctx, keyURL, "/etc/apt/keyrings/example.asc")
			if err == nil || !strings.Contains(err.Error(), forged) {
				t.Fatalf("download = %v, want the stranger named", err)
			}

			if _, kept := fake.Files["/etc/apt/keyrings/example.asc"]; kept {
				t.Fatal("a refused key must not stay where apt reads it")
			}
		})
	}
}

func TestPrimaryFingerprintsLeavesTheSubkeysOut(t *testing.T) {
	listing := "pub:-:4096:1:8D81803C0EBFCD88:1487788586:::-:::scESA::::::23::0:\n" +
		"fpr:::::::::9dc858229fc7dd38854ae2d88d81803c0ebfcd88:\n" +
		"uid:-::::1487792064::0::Docker Release (CE deb) <docker@docker.com>::::::::::0:\n" +
		"sub:-:4096:1:7EA0A9C3F273FCD8:1487788586::::::s::::::23:\n" +
		"fpr:::::::::D3306A018370199E527AE7997EA0A9C3F273FCD8:\n"

	got := apt.PrimaryFingerprints(listing)
	if len(got) != 1 || got[0] != fingerprint {
		t.Fatalf("primary fingerprints = %v", got)
	}
}

func TestEveryPinIsAFullFingerprint(t *testing.T) {
	for url, fingerprints := range apt.Pins {
		if !strings.HasPrefix(url, "https://") || len(fingerprints) == 0 {
			t.Errorf("%s: %v", url, fingerprints)
		}

		for _, pinned := range fingerprints {
			if len(pinned) != 40 || strings.Trim(pinned, "0123456789ABCDEF") != "" {
				t.Errorf("%s: %q is not a 40-digit upper-case fingerprint", url, pinned)
			}
		}
	}
}

// Cloudflare's file now holds only its 2025 key while InRelease is signed by both, so either key must pass.
func TestCloudflaresRotatedKeyIsAccepted(t *testing.T) {
	const url = "https://pkg.cloudflare.com/cloudflare-main.gpg"

	for name, served := range map[string][]string{
		"2025 key alone": {"CC94B39C77AE7342A68B89628A682D308D4E5E73"},
		"previous key":   {"FBA8C0EE63617C5EED695C43254B391D8CACCBF8"},
	} {
		t.Run(name, func(t *testing.T) {
			fake := modtest.NewFakeSys()
			fake.Signers[url] = served
			ctx := modtest.NewContext(t, fake, modtest.Options{})

			if err := apt.DearmorKey(ctx, url, "/usr/share/keyrings/cloudflare-main.gpg"); err != nil {
				t.Fatalf("dearmor = %v", err)
			}
		})
	}
}

func TestDearmorKeyStopsAtTheFirstRefusal(t *testing.T) {
	fake := pinned(t)
	fake.LineFailures["--dearmor"] = "gpg: no valid OpenPGP data found."
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	if err := apt.DearmorKey(ctx, keyURL, keyring); err == nil {
		t.Fatal("a key gpg refuses must fail the step")
	}

	if _, present := fake.Files[keyring]; present {
		t.Fatal("no keyring must be written from a refused key")
	}
}
