package state_test

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules/modtest"
)

func checkOf(t *testing.T, checks []contract.DoctorCheck, name string) contract.DoctorCheck {
	t.Helper()

	for _, check := range checks {
		if check.Name == name {
			return check
		}
	}

	t.Fatalf("no check named %q in %+v", name, checks)

	return contract.DoctorCheck{}
}

func TestDoctorSaysWhatIsMissingAndHowToFixIt(t *testing.T) {
	fake, reader := agentFixture(t)
	fake.FailProgram("pnpm", "pnpm: command not found")
	fake.Replies["bun"] = "1.2.0\n"

	checks := reader.Doctor()

	if missing := checkOf(t, checks, "pnpm"); missing.OK || missing.Fix == "" {
		t.Fatalf("a missing tool comes with its fix: %+v", missing)
	}

	if bun := checkOf(t, checks, "bun"); !bun.OK || bun.Message != "1.2.0" || bun.Fix != "" {
		t.Fatalf("unexpected %+v", bun)
	}

	if session := checkOf(t, checks, `tmux session "pupitre"`); session.OK {
		t.Fatal("no project has started: the session does not exist yet")
	}

	if web := checkOf(t, checks, "web"); !web.OK {
		t.Fatalf("the folder is there: %+v", web)
	}
}

func TestDoctorReportsAProjectWhoseFolderIsGone(t *testing.T) {
	fake, reader := agentFixture(t)
	delete(fake.Dirs, "/home/dev/projects/web")

	web := checkOf(t, reader.Doctor(), "web")
	if web.OK || !strings.Contains(web.Fix, "project.sync web") {
		t.Fatalf("unexpected %+v", web)
	}
}

func TestDiagCarriesTheMachineTheProjectsAndTheSessions(t *testing.T) {
	fake, reader := sessionFixture(t)
	if _, err := reader.Up("web", ""); err != nil {
		t.Fatal(err)
	}

	diag := reader.Diag()

	if diag.GeneratedAt == "" || !strings.HasSuffix(diag.GeneratedAt, "Z") {
		t.Fatalf("unexpected timestamp %q", diag.GeneratedAt)
	}

	for _, expected := range []string{"pupitre-staging", "0.0.0-test", "web", "claude", "doctor"} {
		if !strings.Contains(diag.Report, expected) {
			t.Errorf("the report must mention %q:\n%s", expected, diag.Report)
		}
	}

	if strings.Contains(diag.Report, modtest.Secret) {
		t.Fatal("a diag never carries a secret")
	}

	if len(fake.Signals) != 0 {
		t.Fatalf("a diag reads and stops nothing: %v", fake.Signals)
	}
}

func TestRebootAsksSystemdAndSaysSoWhenItIsRefused(t *testing.T) {
	fake, reader := agentFixture(t)

	if err := reader.Reboot(); err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(strings.Join(fake.Commands(), "\n"), "systemctl reboot") {
		t.Fatalf("unexpected commands %v", fake.Commands())
	}

	fake.FailProgram("systemctl", "Failed to reboot: Access denied")
	if err := reader.Reboot(); err == nil {
		t.Fatal("a refused reboot must be reported")
	}
}
