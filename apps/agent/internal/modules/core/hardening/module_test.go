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

	if string(fake.Files[jailPath]) != string(jail(false)) || !strings.Contains(string(fake.Files[jailPath]), "port = 22\n") || fake.Units[jailUnit] != modtest.UnitActive {
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

var _ modules.Module = Module{}
