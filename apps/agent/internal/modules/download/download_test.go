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

	got := fake.Commands()[0]
	if !strings.HasPrefix(got, "curl -fsSL --proto =https --tlsv1.2 ") || !strings.HasSuffix(got, " -o "+staged+" "+assetURL) {
		t.Fatalf("curl argv = %q: the download runs as root, not as dev", got)
	}

	if !strings.Contains(got, "--connect-timeout ") || !strings.Contains(got, "--speed-time ") || !strings.Contains(got, "--max-time ") {
		t.Fatalf("curl argv = %q: a vendor that stops answering must not hold the install lock", got)
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

	if !strings.Contains(strings.Join(fake.Commands(), "\n"), "(dev) tar -x -z -f - -C /home/dev/server --strip-components=1 < "+archive) {
		t.Fatalf("tar runs as dev, the archive on its standard input:\n%s", strings.Join(fake.Commands(), "\n"))
	}
}

func TestExtractForRootStaysRootsAndReadsTheStagedFile(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Archives[download.Dir+"/archive.tar.gz"] = []string{"tool"}
	ctx := newContext(t, fake)

	archive, _, err := download.Fetch(ctx, "archive.tar.gz", assetURL)
	if err != nil {
		t.Fatal(err)
	}

	if err := download.Extract(ctx, archive, download.Dir+"/tool-1.0", 0, ""); err != nil {
		t.Fatal(err)
	}

	commands := strings.Join(fake.Commands(), "\n")
	if !strings.Contains(commands, "\ntar -x -z -f "+archive+" -C "+download.Dir+"/tool-1.0") || strings.Contains(commands, "(dev)") {
		t.Fatalf("tar must run as root on root's folder:\n%s", commands)
	}
}

func TestLatestVersionReadsTheRedirectWithoutFollowingIt(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("releases/latest", "https://github.com/acme/tool/releases/tag/v1.4.2")
	ctx := newContext(t, fake)

	version, err := download.LatestVersion(ctx, "https://github.com/acme/tool/releases/latest")
	if err != nil || version != "1.4.2" {
		t.Fatalf("version = %q, %v", version, err)
	}

	got := fake.Commands()[0]
	if !strings.HasPrefix(got, "curl -fsS --proto =https") || !strings.Contains(got, "--max-time ") || !strings.Contains(got, "%{redirect_url}") {
		t.Fatalf("curl argv = %q", got)
	}
}

func TestLatestVersionRefusesARedirectThatNamesNoVersion(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("releases/latest", "https://github.com/acme/tool/releases")
	ctx := newContext(t, fake)

	if _, err := download.LatestVersion(ctx, "https://github.com/acme/tool/releases/latest"); err == nil || !strings.Contains(err.Error(), "acme/tool") {
		t.Fatalf("latest = %v, want the unreadable redirect named", err)
	}
}

func TestTheInstalledVersionIsRecordedForRootAloneAndForgotten(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake)

	if download.Recorded(ctx, "tool.demo") != "" {
		t.Fatal("nothing is recorded yet")
	}

	if err := download.Record(ctx, "tool.demo", "1.4.2"); err != nil {
		t.Fatal(err)
	}

	if download.Recorded(ctx, "tool.demo") != "1.4.2" || fake.Modes["/var/lib/pupitre/versions/tool.demo"] != 0o600 {
		t.Fatalf("recorded = %q, mode %o", download.Recorded(ctx, "tool.demo"), fake.Modes["/var/lib/pupitre/versions/tool.demo"])
	}

	if forgotten, err := download.Forget(ctx, "tool.demo"); err != nil || !forgotten || download.Recorded(ctx, "tool.demo") != "" {
		t.Fatalf("forget = %v, %v", forgotten, err)
	}
}

var release = download.GitHubRelease{
	Repo:      "acme/tool",
	Program:   "tool",
	Checksums: "checksums.txt",
	Asset:     func(version string) string { return "tool_" + version + "_linux.tar.gz" },
}

func TestGitHubReleaseInstallsTheCheckedProgramAndSkipsOnReplay(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("releases/latest/download/checksums.txt", "https://github.com/acme/tool/releases/download/v2.0.1/checksums.txt")
	fake.Answer("v2.0.1/checksums.txt", modtest.Digest(modtest.Downloaded)+"  tool_2.0.1_linux.tar.gz\n")
	fake.Archives[download.Dir+"/tool_2.0.1_linux.tar.gz"] = []string{"tool"}
	ctx := newContext(t, fake)

	if err := release.InstallStep(ctx, "tool.demo", "/usr/local/bin/tool"); err != nil {
		t.Fatal(err)
	}

	if fake.Modes["/usr/local/bin/tool"] != 0o755 || download.Recorded(ctx, "tool.demo") != "2.0.1" {
		t.Fatalf("mode %o, recorded %q", fake.Modes["/usr/local/bin/tool"], download.Recorded(ctx, "tool.demo"))
	}

	replay := newContext(t, fake)
	if err := release.InstallStep(replay, "tool.demo", "/usr/local/bin/tool"); err != nil {
		t.Fatal(err)
	}

	if events := replay.Events(); events[len(events)-1].Status != "skip" {
		t.Fatalf("replay = %+v", events)
	}
}

func TestGitHubReleaseRefusesAnArchiveWhoseDigestIsNotPublished(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("releases/latest/download/checksums.txt", "https://github.com/acme/tool/releases/download/v2.0.1/checksums.txt")
	fake.Answer("v2.0.1/checksums.txt", modtest.Digest(modtest.Downloaded)+"  tool_2.0.1_linux_arm64.tar.gz\n")
	ctx := newContext(t, fake)

	err := release.InstallStep(ctx, "tool.demo", "/usr/local/bin/tool")
	if err == nil || !strings.Contains(err.Error(), "tool_2.0.1_linux.tar.gz") {
		t.Fatalf("install = %v, want the unpublished archive named", err)
	}

	if _, installed := fake.Files["/usr/local/bin/tool"]; installed {
		t.Fatal("nothing is installed without a published digest")
	}
}

func TestGitHubReleaseFallsBackToTheDigestGitHubComputes(t *testing.T) {
	bare := download.GitHubRelease{Repo: "acme/tool", Program: "tool", Asset: release.Asset}
	fake := modtest.NewFakeSys()
	fake.Answer("api.github.com/repos/acme/tool/releases/tags/v2.0.1", `{"assets":[{"name":"tool_2.0.1_linux.tar.gz","digest":"sha256:`+modtest.Digest(modtest.Downloaded)+`"}]}`)
	ctx := newContext(t, fake)

	digest, err := bare.Digest(ctx, "2.0.1", "tool_2.0.1_linux.tar.gz")
	if err != nil || digest != modtest.Digest(modtest.Downloaded) {
		t.Fatalf("digest = %q, %v", digest, err)
	}

	if _, err := bare.Digest(ctx, "2.0.1", "tool_2.0.1_darwin.tar.gz"); err == nil {
		t.Fatal("an asset GitHub says nothing of has no digest")
	}
}

func TestGitHubReleaseUpgradesOnlyWhenANewerVersionIsOut(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("releases/latest/download/checksums.txt", "https://github.com/acme/tool/releases/download/v2.0.1/checksums.txt")
	fake.Answer("v2.0.1/checksums.txt", modtest.Digest(modtest.Downloaded)+"  tool_2.0.1_linux.tar.gz\n")
	fake.Archives[download.Dir+"/tool_2.0.1_linux.tar.gz"] = []string{"tool"}
	ctx := newContext(t, fake)

	if err := release.UpgradeStep(ctx, "tool.demo", "/usr/local/bin/tool"); err != nil {
		t.Fatal(err)
	}
	if _, installed := fake.Files["/usr/local/bin/tool"]; installed {
		t.Fatal("nothing recorded, nothing to upgrade")
	}

	if err := download.Record(ctx, "tool.demo", "2.0.0"); err != nil {
		t.Fatal(err)
	}
	if err := release.UpgradeStep(ctx, "tool.demo", "/usr/local/bin/tool"); err != nil {
		t.Fatal(err)
	}
	if download.Recorded(ctx, "tool.demo") != "2.0.1" {
		t.Fatalf("recorded = %q", download.Recorded(ctx, "tool.demo"))
	}

	if err := release.RemoveStep(ctx, "tool.demo", "/usr/local/bin/tool"); err != nil {
		t.Fatal(err)
	}
	if _, installed := fake.Files["/usr/local/bin/tool"]; installed || download.Recorded(ctx, "tool.demo") != "" {
		t.Fatal("remove takes the program and the record back")
	}
}

// An install script or a release index is a body of kilobytes: the journal says how much came back, never what.
func TestTextKeepsTheBodyOutOfTheJournal(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("releases.example.org/index.json", `{"tag_name":"v1.0","body":"secret-looking release notes"}`)
	ctx := newContext(t, fake)

	body, err := download.Text(ctx, "https://releases.example.org/index.json")
	if err != nil || !strings.Contains(body, "release notes") {
		t.Fatalf("body = %q, %v", body, err)
	}

	journal := strings.Join(ctx.Output(), "\n")
	if strings.Contains(journal, "release notes") || !strings.Contains(journal, "releases.example.org/index.json") || !strings.Contains(journal, "byte(s) out") {
		t.Fatalf("the journal must name the request and the size, not the body:\n%s", journal)
	}
}
