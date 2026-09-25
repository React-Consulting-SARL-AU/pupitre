package hardening

import (
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules/modtest"
)

const socketListen = "systemctl show ssh.socket --property=Listen --value"

func allowedBeforeEnabled(t *testing.T, fake *modtest.FakeSys, rule string) {
	t.Helper()

	allowed := slices.Index(fake.Mutations, "ufw allow "+rule)
	enabled := slices.Index(fake.Mutations, "ufw enable")
	if allowed < 0 || enabled < 0 || enabled < allowed {
		t.Fatalf("%s must be allowed before the firewall comes up: %v", rule, fake.Mutations)
	}
}

func TestACustomSSHPortIsAllowedBeforeTheFirewallComesUp(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files["/etc/ssh/sshd_config"] = []byte("Include /etc/ssh/sshd_config.d/*.conf\nPort 2222\n")

	run(t, newContext(t, fake, Options{}))

	if strings.Join(fake.Firewall.Rules, ",") != "2222/tcp" {
		t.Fatalf("rules = %v", fake.Firewall.Rules)
	}

	allowedBeforeEnabled(t, fake, "2222/tcp")

	if !strings.Contains(string(fake.Files[jailPath]), "port = 2222\n") {
		t.Fatalf("the jail must watch the port sshd listens on: %q", fake.Files[jailPath])
	}
}

func TestAListenAddressWithItsOwnPortIsAllowed(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files["/etc/ssh/sshd_config"] = []byte("Include /etc/ssh/sshd_config.d/*.conf\nListenAddress 0.0.0.0:2022\nListenAddress [::]:2022\n")

	run(t, newContext(t, fake, Options{}))

	if strings.Join(fake.Firewall.Rules, ",") != "22/tcp,2022/tcp" {
		t.Fatalf("rules = %v", fake.Firewall.Rules)
	}
}

func TestASocketActivatedSSHHasItsListenedPortsAllowed(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Units["ssh.socket"] = modtest.UnitActive
	fake.Replies[socketListen] = "[::]:2200 (Stream)\n0.0.0.0:2200 (Stream)\n"

	run(t, newContext(t, fake, Options{SSH443: true}))

	if strings.Join(fake.Firewall.Rules, ",") != "22/tcp,443/tcp,2200/tcp" {
		t.Fatalf("rules = %v", fake.Firewall.Rules)
	}

	allowedBeforeEnabled(t, fake, "2200/tcp")

	if !strings.Contains(string(fake.Files[jailPath]), "port = 22,443,2200\n") {
		t.Fatalf("jail = %q", fake.Files[jailPath])
	}
}

func TestAnUnreadableSSHDLeavesTheFirewallAlone(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailLine("sshd -T", "/etc/ssh/sshd_config line 3: Bad configuration option: Foo")
	ctx := newContext(t, fake, Options{})

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	if err := (Module{}).Configure(ctx); err == nil {
		t.Fatal("configure must stop when it cannot tell which port SSH listens on")
	}

	if fake.Firewall.Active || len(fake.Firewall.Rules) != 0 {
		t.Fatalf("the firewall must stay as it was: %+v", fake.Firewall)
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Step != "configure-firewall" || last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only=core.hardening" {
		t.Fatalf("unexpected event: %+v", last)
	}
}

func TestAnUnreadableSocketLeavesTheFirewallAlone(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Units["ssh.socket"] = modtest.UnitActive
	fake.FailLine(socketListen, "Failed to connect to bus")

	ctx := newContext(t, fake, Options{})
	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	if err := (Module{}).Configure(ctx); err == nil || fake.Firewall.Active {
		t.Fatalf("configure = %v, firewall %+v", err, fake.Firewall)
	}
}

func TestTurningSSH443OffOnAHardenedMachineClosesItInOnePass(t *testing.T) {
	fake := machine(t, Options{SSH443: true})
	Harden(newContext(t, fake, Options{SSH443: true}), "dev")

	if strings.Join(fake.Firewall.Rules, ",") != "22/tcp,443/tcp" {
		t.Fatalf("rules = %v", fake.Firewall.Rules)
	}

	run(t, newContext(t, fake, Options{}))

	if strings.Join(fake.Firewall.Rules, ",") != "22/tcp" || !strings.Contains(string(fake.Files[jailPath]), "port = 22\n") {
		t.Fatalf("rules = %v, jail = %q", fake.Firewall.Rules, fake.Files[jailPath])
	}

	if strings.Contains(string(fake.Files[FragmentPath]), "443") {
		t.Fatalf("the live fragment must drop 443: %q", fake.Files[FragmentPath])
	}

	mutations := len(fake.Mutations)
	again := newContext(t, fake, Options{})
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

func TestTheOwnersOwnPort443StaysOpenWithTheOptionOff(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files["/etc/ssh/sshd_config"] = []byte("Include /etc/ssh/sshd_config.d/*.conf\nPort 443\n")

	run(t, newContext(t, fake, Options{}))

	if strings.Join(fake.Firewall.Rules, ",") != "443/tcp" {
		t.Fatalf("rules = %v", fake.Firewall.Rules)
	}
}
