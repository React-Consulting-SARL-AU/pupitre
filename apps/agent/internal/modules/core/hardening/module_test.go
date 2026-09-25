package hardening

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
)

func newContext(t *testing.T, fake *modtest.FakeSys, o Options) *modules.Context {
	t.Helper()

	values := modtest.Values{"ssh_443": o.SSH443, "keep_root": o.KeepRoot}

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
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, Options{})

	run(t, ctx)

	for _, pkg := range Packages {
		if fake.Packages[pkg] == "" {
			t.Errorf("%s not installed", pkg)
		}
	}

	if !fake.Firewall.Active || fake.Firewall.Incoming != "deny" || fake.Firewall.Outgoing != "allow" || strings.Join(fake.Firewall.Rules, ",") != "22/tcp" {
		t.Errorf("firewall = %+v", fake.Firewall)
	}

	if string(fake.Files[jailPath]) != string(jail([]int{22})) || !strings.Contains(string(fake.Files[jailPath]), "port = 22\n") || fake.Units[jailUnit] != modtest.UnitActive {
		t.Errorf("jail = %q, unit %s", fake.Files[jailPath], fake.Units[jailUnit])
	}

	if string(fake.Files[PreparedPath]) != string(Fragment(Options{})) || fake.Modes[PreparedPath] != 0o600 {
		t.Errorf("prepared fragment = %q (%o)", fake.Files[PreparedPath], fake.Modes[PreparedPath])
	}

	if _, present := fake.Files[FragmentPath]; present {
		t.Fatal("install must never touch sshd: that is harden's job")
	}

	for _, line := range strings.Split(string(Fragment(Options{})), "\n") {
		if strings.HasPrefix(line, "Port") {
			t.Fatalf("no Port line without ssh_443: %q", line)
		}
	}

	status, err := (Module{}).Status(ctx)
	if err != nil || !status.Installed || !status.Configured || status.State != contract.ServiceRunning || status.Unit != jailUnit {
		t.Fatalf("status = %+v, %v", status, err)
	}

	if err := contract.ValidateValue("ServiceStatusResult", status.Service(manifest())); err != nil {
		t.Fatal(err)
	}
}

func TestReplayOnAnInstalledMachineChangesNothing(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, Options{}))

	mutations := len(fake.Mutations)
	ctx := newContext(t, fake, Options{})
	run(t, ctx)

	for step, status := range statuses(ctx) {
		if status != contract.StepSkip {
			t.Errorf("replay: %s = %s, want skip", step, status)
		}
	}

	if len(fake.Mutations) != mutations || fake.Restarts[jailUnit] != 0 {
		t.Fatalf("replay touched the machine: %v", fake.Mutations[mutations:])
	}
}

func TestSSH443OpensThePortAndTogglingBackClosesIt(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, Options{SSH443: true}))

	if strings.Join(fake.Firewall.Rules, ",") != "22/tcp,443/tcp" {
		t.Fatalf("rules = %v", fake.Firewall.Rules)
	}

	if !strings.Contains(string(fake.Files[jailPath]), "port = 22,443\n") || !strings.HasSuffix(string(fake.Files[PreparedPath]), "Port 22\nPort 443\n") {
		t.Fatalf("jail = %q, fragment = %q", fake.Files[jailPath], fake.Files[PreparedPath])
	}

	ctx := newContext(t, fake, Options{})
	run(t, ctx)

	if strings.Join(fake.Firewall.Rules, ",") != "22/tcp" || fake.Restarts[jailUnit] != 1 {
		t.Fatalf("443 must be closed again and the jail reloaded: %v, %d reload(s)", fake.Firewall.Rules, fake.Restarts[jailUnit])
	}

	if statuses(ctx)["enable-fail2ban"] != contract.StepOK || strings.Contains(string(fake.Files[PreparedPath]), "443") {
		t.Fatalf("events = %v, fragment = %q", statuses(ctx), fake.Files[PreparedPath])
	}
}

func TestKeepRootPreparesAFragmentThatLetsRootBackInByKey(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, Options{KeepRoot: true}))

	prepared := string(fake.Files[PreparedPath])
	if !strings.Contains(prepared, "PermitRootLogin prohibit-password\n") || !strings.Contains(prepared, "AllowUsers dev root\n") {
		t.Fatalf("prepared fragment = %q", prepared)
	}

	if strings.Contains(prepared, "PasswordAuthentication yes") {
		t.Fatalf("keeping root never reopens passwords: %q", prepared)
	}

	run(t, newContext(t, fake, Options{}))

	if !strings.Contains(string(fake.Files[PreparedPath]), "PermitRootLogin no\n") {
		t.Fatalf("turning the option off must close root again: %q", fake.Files[PreparedPath])
	}
}

func TestFailedPackageReportsReplay(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailPackage("fail2ban", "E: Unable to locate package fail2ban")
	ctx := newContext(t, fake, Options{})

	err := (Module{}).Install(ctx)
	if err == nil {
		t.Fatal("expected install to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only=core.hardening" {
		t.Fatalf("unexpected event: %+v", last)
	}
}

func TestUninstallRevertsWhatTheModuleDid(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Units["ssh"] = modtest.UnitActive
	run(t, newContext(t, fake, Options{}))
	fake.Files[FragmentPath] = Fragment(Options{})

	ctx := newContext(t, fake, Options{})
	if err := (Module{}).Uninstall(ctx); err != nil {
		t.Fatal(err)
	}

	for _, path := range []string{FragmentPath, PreparedPath, jailPath} {
		if _, present := fake.Files[path]; present {
			t.Errorf("%s still present", path)
		}
	}

	if fake.Firewall.Active || fake.Restarts["ssh"] != 1 || fake.Packages["ufw"] == "" {
		t.Fatalf("firewall %+v, ssh reloads %d, ufw package %q", fake.Firewall, fake.Restarts["ssh"], fake.Packages["ufw"])
	}
}

// Reopening root goes through the same gate as closing it: a configuration sshd refuses is never reloaded.
func TestUninstallValidatesSshdBeforeReloading(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Units["ssh"] = modtest.UnitActive
	run(t, newContext(t, fake, Options{}))
	fake.Files[FragmentPath] = Fragment(Options{})
	fake.FailProgram("sshd", "/etc/ssh/sshd_config: line 12: Bad configuration option: Foo")

	err := (Module{}).Uninstall(newContext(t, fake, Options{}))
	if err == nil || !strings.Contains(err.Error(), "reopen-sshd") {
		t.Fatalf("uninstall = %v, want reopen-sshd to fail on sshd -t", err)
	}

	if fake.Restarts["ssh"] != 0 {
		t.Fatalf("ssh reloaded %d time(s) on a configuration sshd refused", fake.Restarts["ssh"])
	}
}

func TestEveryFirewallCallIsBounded(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Units["ssh"] = modtest.UnitActive
	run(t, newContext(t, fake, Options{}))

	if err := (Module{}).Uninstall(newContext(t, fake, Options{})); err != nil {
		t.Fatal(err)
	}

	for _, call := range fake.Calls {
		if call.Argv[0] == "ufw" && call.Timeout != ufwTimeout {
			t.Fatalf("ufw call without the timeout: %v", call.Argv)
		}
	}
}

var _ modules.Module = Module{}

func TestFirewallLeavesCaddysRuleOn443Alone(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, Options{}))
	fake.Firewall.Rules = append(fake.Firewall.Rules, "443/tcp")
	fake.Firewall.Comments["443/tcp"] = "caddy"
	mutations := len(fake.Mutations)

	ctx := newContext(t, fake, Options{})
	run(t, ctx)

	if strings.Join(fake.Firewall.Rules, ",") != "22/tcp,443/tcp" {
		t.Fatalf("the hardening closed a port it does not own: %v", fake.Firewall.Rules)
	}

	if statuses(ctx)["configure-firewall"] != contract.StepSkip || len(fake.Mutations) != mutations {
		t.Fatalf("configure-firewall = %s, mutations %v", statuses(ctx)["configure-firewall"], fake.Mutations[mutations:])
	}
}

func TestConfigureOnAHardenedMachineAppliesTheChangedFragment(t *testing.T) {
	fake := hardenedMachine(t)
	Harden(newContext(t, fake, Options{}), "dev")

	ctx := newContext(t, fake, Options{KeepRoot: true})
	run(t, ctx)

	if string(fake.Files[FragmentPath]) != string(Fragment(Options{KeepRoot: true})) {
		t.Fatalf("the live fragment must follow the form: %q", fake.Files[FragmentPath])
	}

	commands := strings.Join(fake.Commands(), "\n")
	if !strings.Contains(commands, "sshd -t") || fake.Restarts["ssh"] != 2 {
		t.Fatalf("sshd must be validated and reloaded on the new fragment: %d reload(s)\n%s", fake.Restarts["ssh"], commands)
	}

	if statuses(ctx)["reload-sshd"] != contract.StepOK {
		t.Fatalf("steps = %v", statuses(ctx))
	}

	mutations := len(fake.Mutations)
	again := newContext(t, fake, Options{KeepRoot: true})
	run(t, again)

	for step, status := range statuses(again) {
		if status != contract.StepSkip {
			t.Errorf("replay: %s = %s, want skip", step, status)
		}
	}
	if len(fake.Mutations) != mutations {
		t.Fatalf("replay touched the machine: %v", fake.Mutations[mutations:])
	}
}

func TestConfigureOnAHardenedMachineRevertsAFragmentSshdRefuses(t *testing.T) {
	fake := hardenedMachine(t)
	Harden(newContext(t, fake, Options{}), "dev")
	fake.FailLine("sshd -t", "Port: bad port number")

	ctx := newContext(t, fake, Options{SSH443: true})
	err := (Module{}).Configure(ctx)
	if err == nil || !strings.Contains(err.Error(), "bad port number") {
		t.Fatalf("configure = %v, want the sshd refusal", err)
	}

	if string(fake.Files[FragmentPath]) != string(Fragment(Options{})) || fake.Restarts["ssh"] != 1 {
		t.Fatalf("the previous fragment must be back and sshd untouched: %q, %d reload(s)", fake.Files[FragmentPath], fake.Restarts["ssh"])
	}
}

func TestConfigureBeforeHardenNeverTouchesSshd(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Users["dev"] = "/home/dev"
	fake.Units["ssh"] = modtest.UnitActive

	run(t, newContext(t, fake, Options{KeepRoot: true}))

	if _, present := fake.Files[FragmentPath]; present || fake.Restarts["ssh"] != 0 {
		t.Fatal("configure must leave sshd to harden until the machine is hardened")
	}
}

func TestConfigureNeverClosesRootItself(t *testing.T) {
	fake := machine(t, Options{KeepRoot: true})
	Harden(newContext(t, fake, Options{KeepRoot: true}), "dev")
	reloads := fake.Restarts["ssh"]

	ctx := newContext(t, fake, Options{})
	run(t, ctx)

	if string(fake.Files[FragmentPath]) != string(Fragment(Options{KeepRoot: true})) {
		t.Fatalf("configure closed root, which only harden may do: %q", fake.Files[FragmentPath])
	}

	if fake.Restarts["ssh"] != reloads {
		t.Fatalf("sshd reloaded %d time(s) by a configure that had nothing to apply", fake.Restarts["ssh"]-reloads)
	}

	var message string
	for _, event := range ctx.Events() {
		if event.Step == "keep-sshd-fragment" {
			message = event.Message
		}
	}

	if !strings.Contains(message, "harden") {
		t.Fatalf("the step must say harden closes root: %q", message)
	}
}
