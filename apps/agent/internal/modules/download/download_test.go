package download_test

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/download"
	"pupitre.studio/agent/internal/modules/modtest"
)

const assetURL = "https://releases.example.org/tool-1.0-linux-x64"

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Module: "tool.demo"})
}

func TestFetchStagesAsRootUnderAPrivateFolderAndRemovesAfter(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake)

	staged, done, err := download.Fetch(ctx, "tool", assetURL)
	if err != nil {
		t.Fatal(err)
	}

	if staged != download.Dir+"/tool" || fake.Modes[download.Dir] != 0o700 {
		t.Fatalf("staged at %s, folder mode %o", staged, fake.Modes[download.Dir])
	}

	if got := fake.Commands()[0]; got != "curl -fsSL --proto =https --tlsv1.2 -o "+staged+" "+assetURL {
		t.Fatalf("curl argv = %q: the download runs as root, not as dev", got)
	}

	done()

	if _, present := fake.Files[staged]; present {
		t.Fatal("the staged file must be removed once done")
	}
}

func TestVerifiedRefusesAFileWhoseDigestDiffers(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake)

	if _, _, err := download.Verified(ctx, "tool", assetURL, modtest.Digest(modtest.Downloaded)); err != nil {
		t.Fatalf("a matching digest must pass: %v", err)
	}

	_, _, err := download.Verified(ctx, "tool", assetURL, strings.Repeat("0", 64))
	if err == nil || !strings.Contains(err.Error(), modtest.Digest(modtest.Downloaded)) {
		t.Fatalf("a wrong digest must be refused and named: %v", err)
	}

	if _, present := fake.Files[download.Dir+"/tool"]; present {
		t.Fatal("a refused file must not stay behind")
	}
}

func TestPublishedFindsTheDigestByName(t *testing.T) {
	document := "aaaa  ./tool-1.0-linux-arm64\nBBBB  ./tool-1.0-linux-x64\n"

	if digest, ok := download.Published(document, "tool-1.0-linux-x64"); !ok || digest != "bbbb" {
		t.Fatalf("published = %q, %v", digest, ok)
	}

	if digest, ok := download.Published("CCCC *archive.tar.gz\n", ""); !ok || digest != "cccc" {
		t.Fatalf("first entry = %q, %v", digest, ok)
	}

	if _, ok := download.Published(document, "tool-2.0-linux-x64"); ok {
		t.Fatal("an absent name must not match")
	}
}

func TestInstallAndExtractHandTheResultToTheOwner(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Users["dev"] = "/home/dev"
	fake.Archives[download.Dir+"/archive.tar.gz"] = []string{"bin/server", "product.json"}
	ctx := newContext(t, fake)

	staged, _, err := download.Fetch(ctx, "tool", assetURL)
	if err != nil {
		t.Fatal(err)
	}

	if err := download.Install(ctx, staged, "/home/dev/.local/bin/tool", 0o755, "dev"); err != nil {
		t.Fatal(err)
	}

	if fake.Modes["/home/dev/.local/bin/tool"] != 0o755 || fake.Owners["/home/dev/.local/bin/tool"] != "dev:dev" {
		t.Fatalf("mode %o, owner %q", fake.Modes["/home/dev/.local/bin/tool"], fake.Owners["/home/dev/.local/bin/tool"])
	}

	archive, _, err := download.Fetch(ctx, "archive.tar.gz", assetURL)
	if err != nil {
		t.Fatal(err)
	}

	if err := download.Extract(ctx, archive, "/home/dev/server", 1, "dev"); err != nil {
		t.Fatal(err)
	}

	if fake.Owners["/home/dev/server/bin/server"] != "dev:dev" || fake.Owners["/home/dev/server"] != "dev:dev" {
		t.Fatalf("owners = %v", fake.Owners)
	}

	if !strings.Contains(strings.Join(fake.Commands(), "\n"), "tar -x -z -f "+archive+" -C /home/dev/server --strip-components=1") {
		t.Fatalf("tar runs as root from the staging folder:\n%s", strings.Join(fake.Commands(), "\n"))
	}
}
