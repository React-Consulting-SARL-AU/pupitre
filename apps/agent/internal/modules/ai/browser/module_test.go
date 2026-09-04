package browser

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/shots"
)

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

func TestFirstInstallLaysDownTheBrowserTheCommandAndTheGallery(t *testing.T) {
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

	if fake.Links[shots.Link] != shots.Binary {
		t.Fatalf("shot must be a link on the agent, got %q", fake.Links[shots.Link])
	}

	unit := string(fake.Files[unitPath])
	if !strings.Contains(unit, "gallery --dir="+shots.Dir) || !strings.Contains(unit, "User="+shots.User) {
		t.Fatalf("the gallery unit must serve the folder as dev:\n%s", unit)
	}

	if fake.Units[Unit] != modtest.UnitActive || !fake.Dirs[shots.Dir] {
		t.Fatalf("the gallery must exist and run: units=%v dirs=%v", fake.Units, fake.Dirs)
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

// A machine without a headless browser still files the captures it is handed: the module warns instead of failing.
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
		warned = warned || strings.Contains(line, "shot <fichier> marche")
	}

	if !warned {
		t.Fatalf("the missing browser must be a warning:\n%s", strings.Join(ctx.Output(), "\n"))
	}
}

func TestUninstallGivesBackTheCommandAndTheServiceButKeepsTheCaptures(t *testing.T) {
	fake := modtest.NewFakeSys()
	install(t, fake)
	fake.Files[shots.Dir+"/2026-09-04/login.png"] = []byte("image")

	if err := (Module{}).Uninstall(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if len(fake.Files[unitPath]) != 0 || installedPackage(newContext(t, fake)) != "" {
		t.Error("the unit and the browser must go")
	}

	if len(fake.Files[shots.Dir+"/2026-09-04/login.png"]) == 0 {
		t.Fatal("the captures belong to the client")
	}
}

func TestFailedGalleryStepCarriesItsReplayCommand(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailProgram("ln", "ln: cannot create symbolic link")

	err := (Module{}).Configure(newContext(t, fake))
	if err == nil {
		t.Fatal("expected the configuration to fail")
	}

	step, ok := err.(*modules.StepError)
	if !ok || step.Step != "link-shot-command" || step.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected error: %#v", err)
	}
}

var _ modules.Module = Module{}

// The Google repository is only reachable on amd64, where the test binary may not run: the step is exercised on its own.
func TestGoogleRepositoryIsWrittenOnce(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake)

	if err := addGoogleRepository(ctx); err != nil {
		t.Fatal(err)
	}

	if string(fake.Files[sourcePath]) != sourceLine || len(fake.Files[keyringPath]) == 0 {
		t.Fatalf("the keyring and the source must be written: %q", fake.Files[sourcePath])
	}

	if len(fake.Files[keyTempPath]) != 0 {
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
