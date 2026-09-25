package system

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/daemon"
	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sudo"
)

const (
	rootKey       = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILykUfO8a7qKBQHbW/KSfnaTtl1nAJxVpOzifJBri1Hl jordan@laptop"
	restrictedKey = `no-port-forwarding,command="echo Please login as ubuntu" ` + rootKey
)

var values = modtest.Values{"timezone": "Europe/Paris", "git_name": "Jordan Monier", "git_email": "jordan@example.org"}

func bareMachine() *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Files["/proc/meminfo"] = []byte("MemTotal:        4015000 kB\nMemFree:          200000 kB\n")
	fake.Files["/proc/swaps"] = []byte("Filename\t\t\t\tType\t\tSize\t\tUsed\t\tPriority\n")
	fake.Files["/etc/os-release"] = []byte("NAME=\"Ubuntu\"\nPRETTY_NAME=\"Ubuntu 24.04.1 LTS\"\n")
	fake.Files["/root/.ssh/authorized_keys"] = []byte(rootKey + "\n")
	fake.Units["apt-daily.timer"] = modtest.UnitActive
	fake.Units["apt-daily-upgrade.timer"] = modtest.UnitActive

	return fake
}

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Values: values})
}

func run(t *testing.T, ctx *modules.Context) {
	t.Helper()

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}
}

func statuses(ctx *modules.Context) map[string]contract.StepStatus {
	result := map[string]contract.StepStatus{}
	for _, event := range ctx.Events() {
		result[event.Step] = event.Status
	}

	return result
}

func TestInstallOnABareMachine(t *testing.T) {
	fake := bareMachine()
	ctx := newContext(t, fake)

	run(t, ctx)

	for _, pkg := range append(Packages, "earlyoom") {
		if fake.Packages[pkg] == "" {
			t.Errorf("%s not installed", pkg)
		}
	}

	commands := strings.Join(fake.Commands(), "\n")
	for _, want := range []string{
		"fallocate -l 2G /swapfile",
		"mkswap /swapfile",
		"swapon /swapfile",
		"timedatectl set-timezone Europe/Paris",
		"useradd --create-home --user-group --shell /usr/bin/zsh dev",
		"sysctl -q -p /etc/sysctl.d/99-pupitre.conf",
	} {
		if !strings.Contains(commands, want) {
			t.Errorf("command %q not run:\n%s", want, commands)
		}
	}

	if fake.Units["earlyoom"] != modtest.UnitActive || fake.Units["systemd-oomd"] == modtest.UnitActive {
		t.Errorf("memory guard units = %v", fake.Units)
	}

	if !strings.Contains(string(fake.Files["/etc/fstab"]), fstabLine) || fake.Users["dev"] == "" {
		t.Error("swap not in fstab or dev missing")
	}

	files := map[string]string{
		sudoersPath:        sudo.Open,
		sysctlPath:         sysctl,
		aptPeriodicPath:    aptPeriodic,
		timezonePath:       "Europe/Paris\n",
		tmuxPath:           tmuxConf,
		authorizedKeysPath: rootKey + "\n",
	}
	for path, want := range files {
		if string(fake.Files[path]) != want {
			t.Errorf("%s = %q", path, fake.Files[path])
		}
	}

	if fake.Modes[sudoersPath] != 0o440 || fake.Modes[authorizedKeysPath] != 0o600 {
		t.Errorf("modes: sudoers %o, authorized_keys %o", fake.Modes[sudoersPath], fake.Modes[authorizedKeysPath])
	}

	for _, path := range []string{sshDir, configDir, ProjectsDir, authorizedKeysPath, zshrcPath, tmuxPath, gitconfigPath} {
		if fake.Owners[path] != "dev:dev" {
			t.Errorf("%s owned by %q, want dev:dev", path, fake.Owners[path])
		}
	}

	zshrc := string(fake.Files[zshrcPath])
	for _, want := range []string{zshrcBase, "# >>> pupitre core.system >>>", `export PROJECTS_DIR='/home/dev/projects'`, `\e]133;A\a`, `\e]133;B\a`, `\e]133;C\a`, `\e]133;D;%s\a`, `\e]7;file://`, `mise" activate zsh`, "# <<< pupitre core.system <<<"} {
		if !strings.Contains(zshrc, want) {
			t.Errorf(".zshrc lacks %q:\n%s", want, zshrc)
		}
	}

	if gitconfig := string(fake.Files[gitconfigPath]); !strings.Contains(gitconfig, "\tname = \"Jordan Monier\"\n\temail = \"jordan@example.org\"\n") {
		t.Errorf(".gitconfig = %q", gitconfig)
	}

	for step, status := range statuses(ctx) {
		if status == contract.StepFail {
			t.Errorf("step %s failed", step)
		}
	}

	status, err := (Module{}).Status(ctx)
	if err != nil || !status.Installed || !status.Configured || status.Version != "Ubuntu 24.04.1 LTS" || status.State != contract.ServiceRunning {
		t.Fatalf("status = %+v, %v", status, err)
	}

	if err := contract.ValidateValue("ServiceStatusResult", status.Service(manifest())); err != nil {
		t.Fatal(err)
	}
}

func TestReplayOnAnInstalledMachineChangesNothing(t *testing.T) {
	fake := bareMachine()
	run(t, newContext(t, fake))
	fake.Files[passwdPath] = []byte("root:x:0:0:root:/root:/bin/bash\ndev:x:1000:1000::/home/dev:/usr/bin/zsh\n")

	mutations, calls := len(fake.Mutations), len(fake.Calls)
	ctx := newContext(t, fake)
	run(t, ctx)

	for step, status := range statuses(ctx) {
		if status != contract.StepSkip {
			t.Errorf("replay: %s = %s, want skip", step, status)
		}
	}

	if len(fake.Mutations) != mutations {
		t.Fatalf("replay wrote to the machine: %v", fake.Mutations[mutations:])
	}

	t.Logf("first run: %d calls, %d mutations; replay: %d calls, 0 mutations", calls, mutations, len(fake.Calls)-calls)
}

// The password rule is the client's choice, taken by harden.sudo: an upgrade never hands NOPASSWD:ALL back.
func TestUpgradeLeavesTheSudoPasswordRuleInPlace(t *testing.T) {
	fake := bareMachine()
	run(t, newContext(t, fake))
	fake.Files[passwdPath] = []byte("root:x:0:0:root:/root:/bin/bash\ndev:x:1000:1000::/home/dev:/usr/bin/zsh\n")
	fake.Files[sudoersPath] = []byte(sudo.Restricted)

	status, err := (Module{}).Check(newContext(t, fake))
	if err != nil || !status.Configured {
		t.Fatalf("a machine under the password rule must read as configured: %+v, %v", status, err)
	}

	ctx := newContext(t, fake)
	if err := (Module{}).Upgrade(ctx); err != nil {
		t.Fatal(err)
	}

	if string(fake.Files[sudoersPath]) != sudo.Restricted || statuses(ctx)["grant-sudo"] != contract.StepSkip {
		t.Fatalf("sudoers = %q, steps %v", fake.Files[sudoersPath], statuses(ctx))
	}
}

// A machine installed before rsync joined the list still reads as installed, and the next upgrade is what brings the package: once, then never again.
func TestUpgradeBringsAPackageAddedSinceTheInstall(t *testing.T) {
	fake := bareMachine()
	run(t, newContext(t, fake))
	fake.Files[passwdPath] = []byte("root:x:0:0:root:/root:/bin/bash\ndev:x:1000:1000::/home/dev:/usr/bin/zsh\n")
	delete(fake.Packages, "rsync")

	status, err := (Module{}).Check(newContext(t, fake))
	if err != nil || !status.Installed {
		t.Fatalf("a machine missing a package added since must still read as installed: %+v, %v", status, err)
	}

	ctx := newContext(t, fake)
	if err := (Module{}).Upgrade(ctx); err != nil {
		t.Fatal(err)
	}

	if fake.Packages["rsync"] == "" || statuses(ctx)["install-packages"] != contract.StepOK {
		t.Fatalf("upgrade must install rsync: packages %v, steps %v", fake.Packages, statuses(ctx))
	}

	again := newContext(t, fake)
	if err := (Module{}).Upgrade(again); err != nil {
		t.Fatal(err)
	}

	if statuses(again)["install-packages"] != contract.StepSkip {
		t.Fatalf("a second upgrade must find nothing missing: %v", statuses(again))
	}
}

func TestSwapAndMemoryGuardFollowTheMachine(t *testing.T) {
	fake := bareMachine()
	fake.Files["/proc/meminfo"] = []byte("MemTotal:       16318000 kB\n")
	fake.Packages["systemd-oomd"] = "255"
	ctx := newContext(t, fake)

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	commands := strings.Join(fake.Commands(), "\n")
	if !strings.Contains(commands, "fallocate -l 4G /swapfile") {
		t.Errorf("16 GB machine must get a 4G swap:\n%s", commands)
	}

	if fake.Units["systemd-oomd"] != modtest.UnitActive || fake.Packages["earlyoom"] != "" {
		t.Errorf("systemd-oomd must be preferred when present: units %v, packages %v", fake.Units, fake.Packages)
	}

	withSwap := bareMachine()
	withSwap.Files["/proc/swaps"] = []byte("Filename\tType\tSize\tUsed\tPriority\n/dev/vda2\tpartition\t2097148\t0\t-2\n")
	ctx = newContext(t, withSwap)

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	if statuses(ctx)["create-swap"] != contract.StepSkip || strings.Contains(strings.Join(withSwap.Commands(), "\n"), "fallocate") {
		t.Error("an existing swap must be kept")
	}
}

func TestSwapFailureIsAWarningNotAFailure(t *testing.T) {
	fake := bareMachine()
	fake.FailProgram("fallocate", "fallocate: fallocate failed: Operation not supported")
	ctx := newContext(t, fake)

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	if statuses(ctx)["create-swap"] != contract.StepOK || strings.Contains(string(fake.Files["/etc/fstab"]), "swapfile") {
		t.Fatalf("create-swap = %s, fstab = %q", statuses(ctx)["create-swap"], fake.Files["/etc/fstab"])
	}

	if output := strings.Join(ctx.Output(), "\n"); !strings.Contains(output, "! the swap file was not created") {
		t.Fatalf("no warning in output:\n%s", output)
	}
}

func TestFailedPackageReportsReplay(t *testing.T) {
	fake := bareMachine()
	fake.FailPackage("git", "E: Unable to locate package git")
	ctx := newContext(t, fake)

	err := (Module{}).Install(ctx)
	if err == nil || !strings.Contains(err.Error(), "core.system · install-packages : packages not found or refused: git") {
		t.Fatalf("unexpected error: %v", err)
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only=core.system" {
		t.Fatalf("unexpected event: %+v", last)
	}

	if fake.Packages["zsh"] == "" {
		t.Fatal("the other packages must still be installed one by one")
	}
}

func TestSeedingSkipsRestrictedKeysAndKeepsDevKeys(t *testing.T) {
	fake := bareMachine()
	fake.Files["/root/.ssh/authorized_keys"] = []byte(restrictedKey + "\n")
	ctx := newContext(t, fake)

	run(t, ctx)

	if _, present := fake.Files[authorizedKeysPath]; present || statuses(ctx)["seed-authorized-keys"] != contract.StepSkip {
		t.Fatalf("a command-restricted key must not open dev: %q", fake.Files[authorizedKeysPath])
	}

	fake = bareMachine()
	fake.Files[authorizedKeysPath] = []byte("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILykUfO8a7qKBQHbW/KSfnaTtl1nAJxVpOzifJBri1Hl other@laptop\n# platform block\n")
	run(t, newContext(t, fake))

	if got := string(fake.Files[authorizedKeysPath]); strings.Count(got, "ssh-ed25519") != 1 || !strings.Contains(got, "# platform block") {
		t.Fatalf("dev keys must be kept and not duplicated: %q", got)
	}
}

// Root reads dev's authorized_keys to add its own: a link dev planted there must not bring another file into it.
func TestSeedingRefusesAnAuthorizedKeysLinkOutOfTheHome(t *testing.T) {
	fake := bareMachine()
	fake.Files["/etc/shadow"] = []byte("root:$6$secret:20000:0:99999:7:::\n")
	fake.Links[authorizedKeysPath] = "/etc/shadow"
	ctx := newContext(t, fake)

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := (Module{}).Configure(ctx); err == nil {
		t.Fatal("a link out of the home was read as dev's keys")
	}

	if statuses(ctx)["seed-authorized-keys"] != contract.StepFail {
		t.Fatalf("steps = %v", statuses(ctx))
	}

	if strings.Contains(string(fake.Files[authorizedKeysPath]), "secret") {
		t.Fatal("the linked file reached dev's authorized_keys")
	}
}

func TestExistingUserGetsZshAndSudo(t *testing.T) {
	fake := bareMachine()
	fake.Users["dev"] = "/home/dev"
	fake.Files[passwdPath] = []byte("dev:x:1000:1000::/home/dev:/bin/bash\n")
	ctx := newContext(t, fake)

	run(t, ctx)

	commands := strings.Join(fake.Commands(), "\n")
	if strings.Contains(commands, "useradd") || !strings.Contains(commands, "chsh -s /usr/bin/zsh dev") {
		t.Fatalf("existing user must only change shell:\n%s", commands)
	}
}

// A swap file allocated but never enabled must not survive the failure: left there, the next run would take it for a swap.
func TestAHalfMadeSwapFileIsRemovedAndTheNextRunTriesAgain(t *testing.T) {
	fake := bareMachine()
	fake.FailProgram("mkswap", "mkswap: /swapfile: insecure permissions 0644")
	ctx := newContext(t, fake)

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	if _, present := fake.Files["/swapfile"]; present || statuses(ctx)["create-swap"] != contract.StepOK {
		t.Fatalf("swapfile present %v, create-swap = %s", present, statuses(ctx)["create-swap"])
	}

	delete(fake.Failures, "mkswap")
	ctx = newContext(t, fake)

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	commands := strings.Join(fake.Commands(), "\n")
	if statuses(ctx)["create-swap"] != contract.StepOK || strings.Count(commands, "fallocate -l 2G /swapfile") != 2 || !strings.Contains(string(fake.Files["/etc/fstab"]), "/swapfile") {
		t.Fatalf("create-swap = %s, fstab = %q:\n%s", statuses(ctx)["create-swap"], fake.Files["/etc/fstab"], commands)
	}
}

func TestUninstallRemovesOnlyWhatTheModuleWrote(t *testing.T) {
	fake := bareMachine()
	run(t, newContext(t, fake))
	ctx := newContext(t, fake)

	if err := (Module{}).Uninstall(ctx); err != nil {
		t.Fatal(err)
	}

	for _, path := range []string{sudoersPath, sysctlPath, aptPeriodicPath} {
		if _, present := fake.Files[path]; present {
			t.Errorf("%s still present", path)
		}
	}

	if strings.Contains(string(fake.Files[zshrcPath]), "pupitre") || strings.Contains(string(fake.Files[gitconfigPath]), "[user]") {
		t.Error("blocks still present")
	}

	if fake.Users["dev"] == "" || fake.Packages["git"] == "" || string(fake.Files[authorizedKeysPath]) != rootKey+"\n" {
		t.Error("uninstall must keep the user, the packages and the keys")
	}
}

var _ modules.Module = Module{}

func TestShellMarkersAreLaidDownForZshAndBash(t *testing.T) {
	fake := bareMachine()
	run(t, newContext(t, fake))

	markers := []string{`\e]133;A`, `\e]133;B`, `\e]133;C`, `\e]133;D`, `\e]7;file://`}

	for path, extra := range map[string][]string{
		zshrcPath:  {`mise" activate zsh`, "add-zsh-hook precmd _pupitre_precmd"},
		bashrcPath: {`mise" activate bash`, "PROMPT_COMMAND=", "trap '_pupitre_preexec' DEBUG"},
	} {
		content := string(fake.Files[path])
		for _, want := range append(markers, extra...) {
			if !strings.Contains(content, want) {
				t.Errorf("%s lacks %q:\n%s", path, want, content)
			}
		}
	}

	if fake.Owners[bashrcPath] != "dev:dev" {
		t.Errorf(".bashrc owned by %q, want dev:dev", fake.Owners[bashrcPath])
	}
}

func TestTwoPassesLeaveASingleShellFragment(t *testing.T) {
	fake := bareMachine()
	run(t, newContext(t, fake))

	before := map[string]string{zshrcPath: string(fake.Files[zshrcPath]), bashrcPath: string(fake.Files[bashrcPath])}

	ctx := newContext(t, fake)
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	for path, first := range before {
		content := string(fake.Files[path])

		if count := strings.Count(content, "# >>> pupitre "+ID+" >>>"); count != 1 {
			t.Errorf("%s carries %d fragments after two passes:\n%s", path, count, content)
		}

		if content != first {
			t.Errorf("%s changed on the second pass:\n%s", path, content)
		}
	}

	for _, step := range []string{"write-zshrc", "write-bashrc"} {
		if status := statuses(ctx)[step]; status != contract.StepSkip {
			t.Errorf("%s = %s on the second pass, want skip", step, status)
		}
	}
}

func TestDevCommandIsLinkedToTheBinaryAndRemovedOnUninstall(t *testing.T) {
	fake := bareMachine()
	run(t, newContext(t, fake))

	if fake.Links[devcli.Link] != devcli.Binary {
		t.Fatalf("%s points at %q, want %q", devcli.Link, fake.Links[devcli.Link], devcli.Binary)
	}

	ctx := newContext(t, fake)
	if err := (Module{}).Uninstall(ctx); err != nil {
		t.Fatal(err)
	}

	if _, linked := fake.Links[devcli.Link]; linked {
		t.Error("the link survives the uninstall")
	}

	if strings.Contains(string(fake.Files[bashrcPath]), "pupitre") {
		t.Error("the bash fragment survives the uninstall")
	}
}

// Nothing reads the platform on a server where the service is missing: the module that lays the machine down lays it down too.
func TestConfigureInstallsAndEnablesTheAgentService(t *testing.T) {
	fake := bareMachine()
	ctx := newContext(t, fake)

	run(t, ctx)

	unit := string(fake.Files[daemon.UnitPath])
	if !strings.Contains(unit, "pupitred daemon") || !strings.Contains(unit, "Restart=always") {
		t.Fatalf("unit:\n%s", unit)
	}

	if fake.Units[daemon.Unit] != modtest.UnitActive {
		t.Fatalf("unit state = %q", fake.Units[daemon.Unit])
	}

	if statuses(ctx)["install-agent-unit"] != contract.StepOK {
		t.Fatalf("steps = %v", statuses(ctx))
	}

	replayed := newContext(t, fake)
	run(t, replayed)

	if statuses(replayed)["install-agent-unit"] != contract.StepSkip {
		t.Fatalf("rejeu = %v", statuses(replayed))
	}
}

func TestUninstallTakesTheAgentServiceAway(t *testing.T) {
	fake := bareMachine()
	run(t, newContext(t, fake))

	if err := (Module{}).Uninstall(newContext(t, fake)); err != nil {
		t.Fatal(err)
	}

	if _, present := fake.Files[daemon.UnitPath]; present {
		t.Fatal("the unit stayed in place")
	}
}

// A folder root made under ~/.local on an earlier run locks dev out of mise, node and every agent CLI.
func TestPrepareHomeGivesLocalBackToDev(t *testing.T) {
	fake := bareMachine()
	fake.Users["dev"] = Home
	fake.Dirs[Home] = true
	fake.Owners[Home] = "dev:dev"
	fake.Dirs[sshDir] = true
	fake.Dirs[configDir] = true
	fake.Dirs[localDir] = true
	fake.Dirs[localBinDir] = true
	fake.Owners[localBinDir] = "dev:dev"
	fake.Files[localBinDir+"/mise"] = []byte("elf")
	fake.Owners[localBinDir+"/mise"] = "dev:dev"
	ctx := newContext(t, fake)

	if err := prepareHome(ctx); err != nil {
		t.Fatal(err)
	}

	for _, dir := range []string{localDir, localBinDir, localShareDir} {
		if !fake.Dirs[dir] || fake.Owners[dir] != "dev:dev" {
			t.Errorf("%s: exists %v, owner %q", dir, fake.Dirs[dir], fake.Owners[dir])
		}
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Step != "prepare-home" || last.Status != contract.StepOK {
		t.Fatalf("event = %+v", last)
	}

	if err := prepareHome(ctx); err != nil {
		t.Fatal(err)
	}

	last = ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepSkip {
		t.Fatalf("second pass must skip, got %+v", last)
	}
}

// A /home/dev that predates the user — a previous install, an image with the folder — stays root's after useradd, and dev owns nothing of their own home.
func TestPrepareHomeGivesAPreexistingHomeBackToDev(t *testing.T) {
	fake := bareMachine()
	fake.Dirs[Home] = true
	fake.Files[Home+"/.profile"] = []byte("# leftover\n")
	ctx := newContext(t, fake)

	run(t, ctx)

	if fake.Owners[Home] != "dev:dev" || fake.Owners[Home+"/.profile"] != "dev:dev" {
		t.Fatalf("home owner %q, leftover owner %q", fake.Owners[Home], fake.Owners[Home+"/.profile"])
	}

	again := newContext(t, fake)
	run(t, again)

	if statuses(again)["prepare-home"] != contract.StepSkip {
		t.Fatalf("replay = %v", statuses(again))
	}
}

// enable --now on a unit already active is a no-op: a changed unit only applies once the daemon restarts on it.
func TestInstallAgentUnitRestartsTheDaemonOnAChangedUnit(t *testing.T) {
	fake := bareMachine()
	run(t, newContext(t, fake))
	fake.Files[daemon.UnitPath] = []byte("[Service]\nExecStart=/usr/local/bin/pupitred daemon\n")

	ctx := newContext(t, fake)
	if err := installAgentUnit(ctx); err != nil {
		t.Fatal(err)
	}

	if string(fake.Files[daemon.UnitPath]) != daemon.UnitFile || fake.Restarts[daemon.Unit] != 1 {
		t.Fatalf("unit rewritten %v, restarts %d", string(fake.Files[daemon.UnitPath]) == daemon.UnitFile, fake.Restarts[daemon.Unit])
	}

	again := newContext(t, fake)
	if err := installAgentUnit(again); err != nil {
		t.Fatal(err)
	}

	if statuses(again)["install-agent-unit"] != contract.StepSkip || fake.Restarts[daemon.Unit] != 1 {
		t.Fatalf("replay = %v, restarts %d", statuses(again), fake.Restarts[daemon.Unit])
	}
}

func TestTimezoneFailureIsAWarningNotAFailure(t *testing.T) {
	fake := bareMachine()
	fake.FailProgram("timedatectl", "Failed to set time zone: Invalid time zone 'Europe/Paris'")
	ctx := newContext(t, fake)

	run(t, ctx)

	if statuses(ctx)["set-timezone"] != contract.StepOK || fake.Users["dev"] == "" {
		t.Fatalf("set-timezone = %s, dev created %v", statuses(ctx)["set-timezone"], fake.Users["dev"] != "")
	}

	if output := strings.Join(ctx.Output(), "\n"); !strings.Contains(output, "! the time zone was not set") {
		t.Fatalf("no warning in output:\n%s", output)
	}
}

func TestUpgradeTakesEveryPackageInOneAptCall(t *testing.T) {
	fake := bareMachine()
	run(t, newContext(t, fake))
	fake.Files[passwdPath] = []byte("dev:x:1000:1000::/home/dev:/usr/bin/zsh\n")
	fake.Upgrades["git"] = "2.50"
	fake.Upgrades["tmux"] = "3.5"
	before := len(fake.Calls)

	ctx := newContext(t, fake)
	if err := (Module{}).Upgrade(ctx); err != nil {
		t.Fatal(err)
	}

	installs := 0
	for _, call := range fake.Calls[before:] {
		if call.Argv[0] == "apt-get" && strings.Contains(strings.Join(call.Argv, " "), " install ") {
			installs++
		}
	}

	if installs != 1 || fake.Packages["git"] != "2.50" || fake.Packages["tmux"] != "3.5" || statuses(ctx)["upgrade-packages"] != contract.StepOK {
		t.Fatalf("%d apt-get install call(s), git %s, tmux %s, step %s", installs, fake.Packages["git"], fake.Packages["tmux"], statuses(ctx)["upgrade-packages"])
	}

	again := newContext(t, fake)
	if err := (Module{}).Upgrade(again); err != nil {
		t.Fatal(err)
	}

	if statuses(again)["upgrade-packages"] != contract.StepSkip {
		t.Fatalf("replay = %v", statuses(again))
	}
}
