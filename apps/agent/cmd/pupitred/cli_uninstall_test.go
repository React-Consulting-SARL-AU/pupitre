package main

import (
	"bytes"
	"io"
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/daemon"
	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/keys"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/shots"
	"pupitre.studio/agent/internal/sudo"
	"pupitre.studio/agent/internal/sys/env"
)

const (
	galleryUnitPath = "/etc/systemd/system/pupitre-shots.service"
	mailpitUnitPath = "/etc/systemd/system/pupitre-mailpit.service"
	zshrc           = "/home/dev/.zshrc"
	servicesEnv     = "POSTGRES_PASSWORD=s3cret\n"
)

func installedMachine(t *testing.T, uid int) *modtest.FakeSys {
	t.Helper()

	fake, _ := setupCLI(t)

	previous := effectiveUID
	effectiveUID = func() int { return uid }
	t.Cleanup(func() { effectiveUID = previous })

	fake.Files[daemon.UnitPath] = []byte(daemon.UnitFile)
	fake.Files[daemon.ResumeUnitPath] = []byte(daemon.ResumeUnitFile)
	fake.Files[galleryUnitPath] = []byte("[Service]\nUser=dev\nExecStart=/usr/local/bin/pupitred gallery --dir=/home/dev/shots --port=8099\n")
	fake.Files[mailpitUnitPath] = []byte("[Service]\nExecStart=/usr/local/bin/mailpit --smtp 127.0.0.1:1025\n")
	fake.Units[daemon.Unit] = modtest.UnitActive
	fake.Units[daemon.ResumeUnit] = modtest.UnitActive
	fake.Units["pupitre-shots"] = modtest.UnitActive
	fake.Units["pupitre-mailpit"] = modtest.UnitActive

	fake.Files[agentBinary] = []byte("pupitred binary")
	fake.Links[devcli.Link] = agentBinary
	fake.Files[shots.Link] = []byte("pupitred binary")
	fake.Files["/usr/local/bin/mailpit"] = []byte("mailpit binary")

	fake.Files[sudo.Path] = []byte(sudo.Restricted)
	fake.Modes[sudo.Path] = 0o440

	fake.Files[env.Path] = []byte(servicesEnv)
	fake.Modes[env.Path] = 0o600
	fake.Files["/etc/pupitre/install.json"] = []byte(`{"modules":["core.system"]}`)
	fake.Files["/etc/pupitre/demo/tool.demo.conf"] = []byte("port=8080\n")

	fake.Files["/var/lib/pupitre/report.json"] = []byte("{}")
	fake.Files["/var/log/pupitre.log"] = []byte("journal\n")
	fake.Files["/var/log/pupitre.log.1"] = []byte("older\n")
	fake.Files["/var/log/syslog"] = []byte("system\n")
	fake.Files[logRotationPath] = []byte("/var/log/pupitre.log {}\n")

	fake.Files[zshrc] = []byte("# >>> pupitre core.system >>>\nexport PROJECTS_DIR='/home/dev/projects'\n# <<< pupitre core.system <<<\n")
	fake.Files[keys.DefaultPath] = []byte(clientKey + "\n# >>> pupitre keys >>>\n" + lostKey + "\n# <<< pupitre keys <<<\n")

	return fake
}

func uninstallWith(t *testing.T, terminal bool, answer string, args ...string) (int, string, string) {
	t.Helper()

	previous := interactive
	interactive = func(io.Reader) bool { return terminal }
	t.Cleanup(func() { interactive = previous })

	var stdout, stderr bytes.Buffer
	code := run(append([]string{"uninstall"}, args...), strings.NewReader(answer), &stdout, &stderr)

	return code, stdout.String(), stderr.String()
}

func TestUninstallRemovesTheAgentAndKeepsTheClientsServer(t *testing.T) {
	fake := installedMachine(t, 0)
	keysBefore := string(fake.Files[keys.DefaultPath])
	zshrcBefore := string(fake.Files[zshrc])

	code, stdout, stderr := runCLI(t, "uninstall", "--yes")
	if code != 0 {
		t.Fatalf("code = %d, stdout = %s, stderr = %s", code, stdout, stderr)
	}

	for _, gone := range []string{
		daemon.UnitPath, daemon.ResumeUnitPath, galleryUnitPath,
		agentBinary, shots.Link,
		"/etc/pupitre/install.json", "/etc/pupitre/demo/tool.demo.conf", "/etc/pupitre/server.token",
		"/var/lib/pupitre/report.json", "/var/lib/pupitre/license.json",
		"/var/log/pupitre.log", "/var/log/pupitre.log.1", logRotationPath,
	} {
		if _, left := fake.Files[gone]; left {
			t.Errorf("%s is still there", gone)
		}
	}

	if _, left := fake.Links[devcli.Link]; left {
		t.Error("the dev link is still there")
	}

	for path, want := range map[string]string{
		env.Path:                 servicesEnv,
		mailpitUnitPath:          "[Service]\nExecStart=/usr/local/bin/mailpit --smtp 127.0.0.1:1025\n",
		"/usr/local/bin/mailpit": "mailpit binary",
		"/var/log/syslog":        "system\n",
		zshrc:                    zshrcBefore,
		keys.DefaultPath:         keysBefore,
		sudo.Path:                sudo.Password,
	} {
		if got := string(fake.Files[path]); got != want {
			t.Errorf("%s = %q, want %q", path, got, want)
		}
	}

	if fake.Modes[env.Path] != 0o600 || fake.Modes[sudo.Path] != 0o440 {
		t.Errorf("env %o, sudoers %o", fake.Modes[env.Path], fake.Modes[sudo.Path])
	}

	if fake.Units["pupitre-mailpit"] != modtest.UnitActive {
		t.Error("the client's mailpit was stopped")
	}

	if !strings.Contains(stdout, env.Path) || !strings.Contains(stdout, "delete it in the app") {
		t.Errorf("stdout = %s", stdout)
	}
}

func TestUninstallStopsTheAgentButLeavesTheResumedProjectsRunning(t *testing.T) {
	fake := installedMachine(t, 0)

	if code, _, stderr := runCLI(t, "uninstall", "--yes"); code != 0 {
		t.Fatalf("code = %d, stderr = %s", code, stderr)
	}

	commands := fake.Commands()

	for _, want := range []string{"systemctl disable --now pupitred", "systemctl disable --now pupitre-shots", "systemctl disable pupitre-resume", "systemctl daemon-reload"} {
		if !slices.Contains(commands, want) {
			t.Errorf("%q not run:\n%s", want, strings.Join(commands, "\n"))
		}
	}

	for _, refused := range []string{"systemctl disable --now pupitre-resume", "systemctl stop pupitre-resume", "systemctl disable --now pupitre-mailpit"} {
		if slices.Contains(commands, refused) {
			t.Errorf("%q was run", refused)
		}
	}
}

func TestUninstallChecksTheSudoRuleBeforeItLands(t *testing.T) {
	fake := installedMachine(t, 0)

	if code, _, stderr := runCLI(t, "uninstall", "--yes"); code != 0 {
		t.Fatalf("code = %d, stderr = %s", code, stderr)
	}

	if !slices.Contains(fake.Commands(), "visudo -c -f "+sudo.CandidatePath) {
		t.Fatalf("visudo never checked the candidate:\n%s", strings.Join(fake.Commands(), "\n"))
	}

	if _, left := fake.Files[sudo.CandidatePath]; left {
		t.Fatal("the candidate stayed in sudoers.d")
	}
}

func TestUninstallLeavesARuleItDidNotWrite(t *testing.T) {
	for name, rule := range map[string]string{
		"passwordless sudo from before decision 0015": sudo.Open,
		"a rule of the client's":                      "dev ALL=(ALL) NOPASSWD: /usr/bin/apt\n",
	} {
		t.Run(name, func(t *testing.T) {
			fake := installedMachine(t, 0)
			fake.Files[sudo.Path] = []byte(rule)

			code, stdout, stderr := runCLI(t, "uninstall", "--yes")
			if code != 0 || string(fake.Files[sudo.Path]) != rule || slices.Contains(fake.Commands(), "visudo -c -f "+sudo.CandidatePath) {
				t.Fatalf("code = %d, sudoers = %q, stderr = %s", code, fake.Files[sudo.Path], stderr)
			}

			if !strings.Contains(stdout, "the sudo rule of "+sudo.Path+" as it is") {
				t.Fatalf("stdout = %s", stdout)
			}
		})
	}
}

func TestUninstallKeepsTheSudoRuleVisudoRefuses(t *testing.T) {
	fake := installedMachine(t, 0)
	fake.FailProgram("visudo", "parse error")

	code, stdout, stderr := runCLI(t, "uninstall", "--yes")
	if code != 1 || !strings.Contains(stderr, "1 step(s) failed") || !strings.Contains(stdout, "by hand: sudo visudo -f "+sudo.Path) {
		t.Fatalf("code = %d, stdout = %s, stderr = %s", code, stdout, stderr)
	}

	if string(fake.Files[sudo.Path]) != sudo.Restricted {
		t.Fatalf("sudoers = %q", fake.Files[sudo.Path])
	}
}

func TestUninstallGoesOnPastAFailureAndKeepsTheBinaryToRunAgain(t *testing.T) {
	fake := installedMachine(t, 0)
	fake.FailLine("disable --now pupitred", "Failed to disable unit")

	code, stdout, stderr := runCLI(t, "uninstall", "--yes")
	if code != 1 || !strings.Contains(stdout, "by hand: sudo systemctl disable --now pupitred") {
		t.Fatalf("code = %d, stdout = %s, stderr = %s", code, stdout, stderr)
	}

	if _, kept := fake.Files[daemon.UnitPath]; !kept {
		t.Fatal("the unit of a daemon still running was deleted")
	}

	if _, kept := fake.Files[agentBinary]; !kept {
		t.Fatal("the binary went while a step had failed")
	}

	if _, left := fake.Files["/var/lib/pupitre/report.json"]; left {
		t.Fatal("a failure stopped the steps after it")
	}

	delete(fake.LineFailures, "disable --now pupitred")

	if code, stdout, stderr := runCLI(t, "uninstall", "--yes"); code != 0 || strings.Contains(stdout, "/var/lib/pupitre") {
		t.Fatalf("second run: code = %d, stdout = %s, stderr = %s", code, stdout, stderr)
	}

	if _, left := fake.Files[agentBinary]; left {
		t.Fatal("the second run left the binary")
	}
}

func TestUninstallRunAgainHasNothingLeftToRemove(t *testing.T) {
	fake := installedMachine(t, 0)

	if code, _, stderr := runCLI(t, "uninstall", "--yes"); code != 0 {
		t.Fatalf("code = %d, stderr = %s", code, stderr)
	}

	calls := len(fake.Calls)

	code, stdout, _ := uninstallWith(t, false, "")
	if code != 0 || !strings.Contains(stdout, "Nothing of the Pupitre agent is left") {
		t.Fatalf("code = %d, stdout = %s", code, stdout)
	}

	for _, cmd := range fake.Calls[calls:] {
		if cmd.Argv[0] != "readlink" {
			t.Fatalf("a run with nothing to remove ran %v", cmd.Argv)
		}
	}

	if string(fake.Files[env.Path]) != servicesEnv || string(fake.Files[sudo.Path]) != sudo.Password {
		t.Fatal("the second run touched what the first one kept")
	}
}

func TestUninstallRefusesWithoutRoot(t *testing.T) {
	fake := installedMachine(t, 1000)

	code, _, stderr := runCLI(t, "uninstall", "--yes")
	if code != 1 || !strings.Contains(stderr, "sudo pupitred uninstall") {
		t.Fatalf("code = %d, stderr = %s", code, stderr)
	}

	if _, kept := fake.Files[agentBinary]; !kept || len(fake.Mutations) != 0 {
		t.Fatalf("a refused run changed the machine: %v", fake.Mutations)
	}
}

func TestUninstallAsksBeforeRemovingAnything(t *testing.T) {
	t.Run("not a terminal and no --yes", func(t *testing.T) {
		fake := installedMachine(t, 0)

		code, _, stderr := uninstallWith(t, false, "y\n")
		if code != 1 || !strings.Contains(stderr, "--yes") || len(fake.Mutations) != 0 {
			t.Fatalf("code = %d, stderr = %s, mutations = %v", code, stderr, fake.Mutations)
		}
	})

	t.Run("declined on a terminal", func(t *testing.T) {
		fake := installedMachine(t, 0)

		code, stdout, _ := uninstallWith(t, true, "\n")
		if code != 1 || !strings.Contains(stdout, "Nothing was removed") || len(fake.Mutations) != 0 {
			t.Fatalf("code = %d, stdout = %s, mutations = %v", code, stdout, fake.Mutations)
		}

		if !strings.Contains(stdout, "the pupitred service: stopped") || !strings.Contains(stdout, "Kept:") || !strings.Contains(stdout, "[y/N]") {
			t.Fatalf("the plan was not shown: %s", stdout)
		}
	})

	t.Run("confirmed on a terminal", func(t *testing.T) {
		fake := installedMachine(t, 0)

		code, stdout, stderr := uninstallWith(t, true, "yes\n")
		if code != 0 {
			t.Fatalf("code = %d, stdout = %s, stderr = %s", code, stdout, stderr)
		}

		if _, left := fake.Files[agentBinary]; left {
			t.Fatal("the binary is still there")
		}
	})
}

func TestUninstallSaysHowItIsUsed(t *testing.T) {
	installedMachine(t, 0)

	for _, args := range [][]string{{"uninstall", "--force"}, {"uninstall", "--yes", "--yes"}} {
		if code, _, stderr := runCLI(t, args...); code != 2 || !strings.Contains(stderr, "usage: sudo pupitred uninstall") {
			t.Errorf("%v: code = %d, stderr = %s", args, code, stderr)
		}
	}
}
