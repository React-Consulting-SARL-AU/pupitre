package browser

import (
	"os"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/ai/agents"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sudo"
)

// amd64 unless a test says otherwise: the test binary's own architecture must not choose the path under test.
func TestMain(m *testing.M) {
	Arch = "amd64"

	os.Exit(m.Run())
}

func onArm(t *testing.T, fake *modtest.FakeSys) {
	t.Helper()

	previous, pinned := Arch, headlessDigest
	Arch, headlessDigest = "arm64", modtest.Digest(modtest.Downloaded)
	t.Cleanup(func() { Arch, headlessDigest = previous, pinned })

	fake.Archives["/var/lib/pupitre/downloads/"+headlessArchive] = []string{"chrome-headless-shell-linux-arm64/chrome-headless-shell", "chrome-headless-shell-linux-arm64/libvulkan.so.1"}
}

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest()})
}

func install(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	ctx := newContext(t, fake)

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	for _, event := range ctx.Events() {
		if event.Status == contract.StepFail {
			t.Fatalf("step %s failed", event.Step)
		}
	}

	return ctx
}

// What an agent before 2.1.0 left: the gallery's service, its public address and the shot command.
func withGallery(fake *modtest.FakeSys) {
	fake.Files[retiredUnitPath] = []byte("[Service]\nExecStart=" + sudo.Binary + " gallery\n")
	fake.Units[retiredUnit] = modtest.UnitActive
	fake.Files[retiredExposure] = []byte("PUPITRE_SHOTS_HOSTNAME=shots.flyleaf.dev\nPUPITRE_SHOTS_TOKEN=abc\n")
	fake.Links[RetiredLink] = sudo.Binary
	fake.Files["/home/dev/shots/web/2026-09-04/login.png"] = []byte("image")
}

func TestFirstInstallLaysDownTheBrowserAndItsLibraries(t *testing.T) {
	fake := modtest.NewFakeSys()

	install(t, fake)

	if installedPackage(newContext(t, fake)) == "" {
		t.Fatalf("a headless browser must be installed: %v", fake.Packages)
	}

	for _, pkg := range []string{"libnss3", "libgbm1", "fonts-liberation"} {
		if _, present := fake.Packages[pkg]; !present {
			t.Errorf("the Playwright library %s is missing", pkg)
		}
	}

	status, err := (Module{}).Status(newContext(t, fake))
	if err != nil || !status.Installed || !status.Configured || status.Unit != "" || status.Port != 0 {
		t.Fatalf("the browser runs no service of its own: %+v, %v", status, err)
	}
}

func TestReplayMutatesNothing(t *testing.T) {
	fake := modtest.NewFakeSys()
	install(t, fake)

	fake.Mutations = nil
	ctx := install(t, fake)

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine:\n  %s", strings.Join(fake.Mutations, "\n  "))
	}

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}
}

func TestAnUpgradeRetiresTheGalleryButKeepsTheCaptures(t *testing.T) {
	fake := modtest.NewFakeSys()
	install(t, fake)
	withGallery(fake)

	if status, _ := (Module{}).Check(newContext(t, fake)); status.Configured {
		t.Fatal("a machine still holding the gallery is not configured as this agent wants it")
	}

	if err := (Module{}).Upgrade(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if _, kept := fake.Files[retiredUnitPath]; kept || fake.Units[retiredUnit] == modtest.UnitActive {
		t.Errorf("the gallery service must stop and go: units=%v", fake.Units)
	}

	if _, kept := fake.Files[retiredExposure]; kept {
		t.Error("the gallery's public address and token must go")
	}

	if _, kept := fake.Links[RetiredLink]; kept {
		t.Error("the shot command must go")
	}

	if len(fake.Files["/home/dev/shots/web/2026-09-04/login.png"]) == 0 {
		t.Fatal("the earlier captures belong to the client")
	}

	if status, _ := (Module{}).Check(newContext(t, fake)); !status.Configured {
		t.Fatal("once retired, the module is configured")
	}

	fake.Mutations = nil
	if err := (Module{}).Configure(newContext(t, fake)); err != nil || len(fake.Mutations) != 0 {
		t.Fatalf("a replay has nothing left to retire: %v\n  %s", err, strings.Join(fake.Mutations, "\n  "))
	}
}

func TestAShotCommandThatIsNotTheAgentIsLeftAlone(t *testing.T) {
	fake := modtest.NewFakeSys()
	install(t, fake)
	fake.Links[RetiredLink] = "/opt/shot/bin/shot"

	if err := (Module{}).Upgrade(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if fake.Links[RetiredLink] != "/opt/shot/bin/shot" {
		t.Fatal("someone else's shot is not ours to remove")
	}
}

func TestAMissingBrowserOnlyWarns(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailPackage(chromePackage, "E: Unable to locate package google-chrome-stable")
	fake.FailPackage(chromiumPackage, "E: Unable to locate package chromium")

	ctx := newContext(t, fake)
	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	warned := false

	for _, line := range ctx.Output() {
		warned = warned || strings.Contains(line, "headless browser")
	}

	if !warned {
		t.Fatalf("the missing browser must be a warning:\n%s", strings.Join(ctx.Output(), "\n"))
	}

	var status contract.StepStatus

	for _, event := range ctx.Events() {
		if event.Step == "install-browser" {
			status = event.Status
		}
	}

	if status != contract.StepSkip {
		t.Fatalf("a browser that cannot be installed changes nothing, the step is a skip that warns, got %s", status)
	}
}

func TestUninstallRemovesTheBrowserAndWhatTheGalleryLeft(t *testing.T) {
	fake := modtest.NewFakeSys()
	install(t, fake)
	withGallery(fake)

	if err := (Module{}).Uninstall(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if installedPackage(newContext(t, fake)) != "" {
		t.Error("the browser must go")
	}

	if _, kept := fake.Files[retiredUnitPath]; kept {
		t.Error("the gallery service must go")
	}

	if len(fake.Files["/home/dev/shots/web/2026-09-04/login.png"]) == 0 {
		t.Fatal("the captures belong to the client")
	}
}

func TestAFailedRetirementCarriesItsReplayCommand(t *testing.T) {
	fake := modtest.NewFakeSys()
	withGallery(fake)
	fake.FailProgram("rm", "rm: cannot remove")

	err := (Module{}).Configure(newContext(t, fake))
	if err == nil {
		t.Fatal("expected the configuration to fail")
	}

	step, ok := err.(*modules.StepError)
	if !ok || step.Step != "retire-shot-command" || step.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected error: %#v", err)
	}
}

var _ modules.Module = Module{}

// The Google repository is amd64-only and the test binary may not be, so the step is exercised on its own.
func TestGoogleRepositoryIsWrittenOnce(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake)

	if err := addGoogleRepository(ctx); err != nil {
		t.Fatal(err)
	}

	if string(fake.Files[sourcePath]) != sourceLine || len(fake.Files[keyringPath]) == 0 {
		t.Fatalf("the keyring and the source must be written: %q", fake.Files[sourcePath])
	}

	if len(fake.Files[keyringPath+".asc"]) != 0 {
		t.Error("the downloaded key must not stay behind")
	}

	updates := fake.Updates
	fake.Mutations = nil

	if err := addGoogleRepository(ctx); err != nil {
		t.Fatal(err)
	}

	if fake.Updates != updates+1 || len(fake.Mutations) != 1 || fake.Mutations[0] != "apt-get update" {
		t.Fatalf("a replay reads the lists again and writes nothing else:\n  %s", strings.Join(fake.Mutations, "\n  "))
	}
}

func TestPlaywrightLibrariesFollowTheUbuntuRelease(t *testing.T) {
	for release, want := range map[string][]string{
		"22.04": {"libatk1.0-0", "libatk-bridge2.0-0", "libcups2", "libasound2"},
		"24.04": {"libatk1.0-0t64", "libatk-bridge2.0-0t64", "libcups2t64", "libasound2t64"},
	} {
		t.Run(release, func(t *testing.T) {
			fake := modtest.NewFakeSys()
			fake.Files[osReleasePath] = []byte("ID=ubuntu\nVERSION_ID=\"" + release + "\"\n")

			install(t, fake)

			for _, pkg := range want {
				if fake.Packages[pkg] == "" {
					t.Errorf("%s: %s not installed, packages %v", release, pkg, fake.Packages)
				}
			}

			other := "libasound2t64"
			if release == "24.04" {
				other = "libasound2"
			}

			if fake.Packages[other] != "" {
				t.Errorf("%s: %s is the other release's name", release, other)
			}
		})
	}
}

func TestUbuntusSnapStubIsNoBrowser(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailPackage(chromePackage, "E: Unable to locate package google-chrome-stable")
	fake.Provides[chromiumPackage] = "chromium-browser"
	fake.Files["/usr/bin/chromium-browser"] = []byte("#!/bin/sh\necho install the snap\n")

	first := newContext(t, fake)
	if err := (Module{}).Install(first); err != nil {
		t.Fatal(err)
	}

	again := newContext(t, fake)
	if err := (Module{}).Install(again); err != nil {
		t.Fatal(err)
	}

	for _, ctx := range []*modules.Context{first, again} {
		status, warned := contract.StepStatus(""), false

		for _, event := range ctx.Events() {
			if event.Step == "install-browser" {
				status = event.Status
				warned = warned || strings.Contains(event.Message, "headless browser")
			}
		}

		if status != contract.StepSkip || !warned {
			t.Fatalf("the stub is no browser: step %s, warned %v", status, warned)
		}
	}

	if installedPackage(newContext(t, fake)) != "" {
		t.Fatal("the stub must not count as an installed browser")
	}
}

func TestOnArmTheHeadlessShellOfChromeForTestingIsUnpacked(t *testing.T) {
	fake := modtest.NewFakeSys()
	onArm(t, fake)

	install(t, fake)

	if len(fake.Files[headlessBinary]) == 0 || strings.TrimSpace(string(fake.Files[headlessVersionPath])) != headlessVersion {
		t.Fatalf("the headless shell must sit at its pinned version: %v", fake.Commands())
	}

	if installedPackage(newContext(t, fake)) != "" || fake.Files[sourcePath] != nil {
		t.Fatal("arm64 asks nothing of apt for the browser: Google's repository has no arm64 build and chromium is a snap")
	}

	if !strings.Contains(strings.Join(fake.Commands(), "\n"), headlessURL) {
		t.Fatalf("the archive comes from Chrome for Testing:\n%s", strings.Join(fake.Commands(), "\n"))
	}

	status, err := (Module{}).Check(newContext(t, fake))
	if err != nil || !status.Installed || status.Version != headlessVersion {
		t.Fatalf("status = %+v, %v", status, err)
	}

	fake.Mutations = nil
	install(t, fake)

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine:\n  %s", strings.Join(fake.Mutations, "\n  "))
	}
}

func TestOnArmAGalleryLeftWithoutABrowserIsUpgradedIntoOne(t *testing.T) {
	fake := modtest.NewFakeSys()
	onArm(t, fake)
	withGallery(fake)

	status, err := (Module{}).Check(newContext(t, fake))
	if err != nil || !status.Installed || status.Configured {
		t.Fatalf("the gallery's leftovers make the module installed and owed an upgrade: %+v, %v", status, err)
	}

	if err := (Module{}).Upgrade(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if len(fake.Files[headlessBinary]) == 0 || fake.Files[retiredUnitPath] != nil {
		t.Fatalf("the upgrade lays down the browser and retires the gallery: %v", fake.Commands())
	}

	if status, _ := (Module{}).Check(newContext(t, fake)); !status.Configured || status.Version != headlessVersion {
		t.Fatalf("status = %+v", status)
	}
}

func TestOnArmAnArchiveThatIsNotTheOnePinnedIsRefused(t *testing.T) {
	fake := modtest.NewFakeSys()
	onArm(t, fake)
	headlessDigest = strings.Repeat("0", 64)

	ctx := newContext(t, fake)
	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	if len(fake.Files[headlessBinary]) != 0 {
		t.Fatal("nothing is unpacked from an archive whose digest differs")
	}

	if !strings.Contains(strings.Join(ctx.Output(), "\n"), "headless browser") {
		t.Fatalf("the missing browser must be a warning:\n%s", strings.Join(ctx.Output(), "\n"))
	}
}

func TestOnArmAnUpgradeReplacesAnOlderHeadlessShell(t *testing.T) {
	fake := modtest.NewFakeSys()
	onArm(t, fake)
	fake.Files[headlessBinary] = []byte("old")
	fake.Files[headlessVersionPath] = []byte("150.0.7800.1\n")
	fake.Files[agents.HeadlessDir+"/chrome-headless-shell-linux-arm64/stale.pak"] = []byte("old")

	if err := (Module{}).Upgrade(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if strings.TrimSpace(string(fake.Files[headlessVersionPath])) != headlessVersion || fake.Files[agents.HeadlessDir+"/chrome-headless-shell-linux-arm64/stale.pak"] != nil {
		t.Fatalf("the folder is replaced whole by the pinned version: %v", fake.Commands())
	}

	if err := (Module{}).Uninstall(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if len(fake.Files[headlessBinary]) != 0 {
		t.Fatal("the uninstall removes the headless shell")
	}
}
