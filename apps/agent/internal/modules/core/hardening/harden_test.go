package hardening

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules/modtest"
)

const (
	devKey             = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILykUfO8a7qKBQHbW/KSfnaTtl1nAJxVpOzifJBri1Hl jordan@laptop"
	authorizedKeysPath = "/home/dev/.ssh/authorized_keys"
)

func hardenedMachine(t *testing.T) *modtest.FakeSys {
	t.Helper()

	return machine(t, Options{})
}

func machine(t *testing.T, o Options) *modtest.FakeSys {
	t.Helper()

	fake := modtest.NewFakeSys()
	fake.Users["dev"] = "/home/dev"
	fake.Units["ssh"] = modtest.UnitActive
	fake.Files[authorizedKeysPath] = []byte(devKey + "\n")
	run(t, newContext(t, fake, o))

	return fake
}

func events(fake *modtest.FakeSys, t *testing.T, o Options) (Result, []string) {
	t.Helper()

	ctx := newContext(t, fake, o)
	result := Harden(ctx)

	var steps []string
	for _, event := range ctx.Events() {
		steps = append(steps, event.Step+"="+string(event.Status))
	}

	if err := contract.ValidateValue("HardenResult", result); err != nil {
		t.Fatal(err)
	}

	return result, steps
}

func TestHardenWithoutKeyKeepsRootAndChangesNothing(t *testing.T) {
	fake := hardenedMachine(t)
	delete(fake.Files, authorizedKeysPath)
	mutations := len(fake.Mutations)

	result, steps := events(fake, t, Options{})

	if result.RootClosed || result.NextUser != "root" || !strings.Contains(result.Reason, "no key in /home/dev/.ssh/authorized_keys") {
		t.Fatalf("result = %+v", result)
	}

	if strings.Join(steps, " ") != "protect-links=skip check-authorized-keys=ok" || len(fake.Mutations) != mutations {
		t.Fatalf("steps = %v, mutations = %v", steps, fake.Mutations[mutations:])
	}

	if _, present := fake.Files[FragmentPath]; present {
		t.Fatal("fragment written without a key")
	}
}

func TestHardenWithMalformedKeyKeepsRoot(t *testing.T) {
	fake := hardenedMachine(t)
	fake.Files[authorizedKeysPath] = []byte("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILykUfO8a7 truncated\nnot a key\n")
	mutations := len(fake.Mutations)

	result, _ := events(fake, t, Options{})

	if result.RootClosed || !strings.Contains(result.Reason, "no well-formed key") || !strings.Contains(result.Reason, "2 unreadable line(s)") {
		t.Fatalf("result = %+v", result)
	}

	if len(fake.Mutations) != mutations {
		t.Fatalf("mutations = %v", fake.Mutations[mutations:])
	}
}

func TestHardenWithoutUserKeepsRoot(t *testing.T) {
	fake := hardenedMachine(t)
	delete(fake.Users, "dev")

	result, _ := events(fake, t, Options{})
	if result.RootClosed || !strings.Contains(result.Reason, "the user dev does not exist") {
		t.Fatalf("result = %+v", result)
	}
}

func TestHardenClosesRootThenReplaysWithoutWriting(t *testing.T) {
	fake := hardenedMachine(t)

	result, steps := events(fake, t, Options{})

	if !result.RootClosed || result.RootKept || result.NextUser != "dev" || result.Reason != "" {
		t.Fatalf("result = %+v", result)
	}

	if strings.Join(steps, " ") != "protect-links=skip check-authorized-keys=ok write-sshd-fragment=ok validate-sshd-config=ok reload-sshd=ok confirm-sshd-config=ok" {
		t.Fatalf("steps = %v", steps)
	}

	if string(fake.Files[FragmentPath]) != string(Fragment(Options{})) || fake.Modes[FragmentPath] != 0o644 {
		t.Fatalf("fragment = %q", fake.Files[FragmentPath])
	}

	commands := strings.Join(fake.Commands(), "\n")
	for _, want := range []string{"sshd -t", "systemctl daemon-reload", "systemctl reload ssh"} {
		if !strings.Contains(commands, want) {
			t.Errorf("command %q not run:\n%s", want, commands)
		}
	}

	if fake.Restarts["ssh"] != 1 {
		t.Fatalf("ssh reloaded %d times", fake.Restarts["ssh"])
	}

	mutations := len(fake.Mutations)
	result, steps = events(fake, t, Options{})

	if !result.RootClosed || strings.Join(steps, " ") != "protect-links=skip check-authorized-keys=ok write-sshd-fragment=skip" || len(fake.Mutations) != mutations || fake.Restarts["ssh"] != 1 {
		t.Fatalf("replay: result %+v, steps %v, mutations %v", result, steps, fake.Mutations[mutations:])
	}
}

func TestHardenUsesThePreparedFragmentAndRestartsTheSocketFor443(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Users["dev"] = "/home/dev"
	fake.Units["ssh.socket"] = modtest.UnitActive
	fake.Units["ssh.service"] = modtest.UnitActive
	fake.Files[authorizedKeysPath] = []byte(devKey + "\n")
	run(t, newContext(t, fake, Options{SSH443: true}))

	result, _ := events(fake, t, Options{SSH443: true})

	if !result.RootClosed || !strings.HasSuffix(string(fake.Files[FragmentPath]), "Port 22\nPort 443\n") {
		t.Fatalf("result %+v, fragment %q", result, fake.Files[FragmentPath])
	}

	commands := strings.Join(fake.Commands(), "\n")
	if !strings.Contains(commands, "systemctl restart ssh.socket ssh.service") || strings.Contains(commands, "systemctl reload ssh") {
		t.Fatalf("socket-activated sshd must restart socket and service:\n%s", commands)
	}
}

func TestInvalidSSHDConfigIsRevertedAndRootStays(t *testing.T) {
	fake := hardenedMachine(t)
	fake.FailProgram("sshd", "/etc/ssh/sshd_config.d/10-pupitre.conf: line 5: Bad configuration option: AllowUsers")
	mutations := len(fake.Mutations)

	result, steps := events(fake, t, Options{})

	if result.RootClosed || result.NextUser != "root" || !strings.Contains(result.Reason, "the sshd configuration is invalid, the fragment was removed") || !strings.Contains(result.Reason, "Bad configuration option") {
		t.Fatalf("result = %+v", result)
	}

	if strings.Join(steps, " ") != "protect-links=skip check-authorized-keys=ok write-sshd-fragment=ok validate-sshd-config=fail revert-sshd-fragment=ok" {
		t.Fatalf("steps = %v", steps)
	}

	if _, present := fake.Files[FragmentPath]; present || fake.Restarts["ssh"] != 0 {
		t.Fatalf("fragment must be gone and sshd untouched: %q, %d reload(s)", fake.Files[FragmentPath], fake.Restarts["ssh"])
	}

	if strings.Join(fake.Mutations[mutations:], " / ") != "write "+FragmentPath+" / remove "+FragmentPath {
		t.Fatalf("mutations = %v", fake.Mutations[mutations:])
	}
}

func TestInvalidConfigRestoresThePreviousFragment(t *testing.T) {
	fake := hardenedMachine(t)
	Harden(newContext(t, fake, Options{}))
	fake.Files[PreparedPath] = Fragment(Options{SSH443: true})
	fake.FailProgram("sshd", "Port: bad port number")

	result, steps := events(fake, t, Options{SSH443: true})

	if result.RootClosed || string(fake.Files[FragmentPath]) != string(Fragment(Options{})) {
		t.Fatalf("result %+v, fragment %q", result, fake.Files[FragmentPath])
	}

	if steps[len(steps)-1] != "revert-sshd-fragment=ok" {
		t.Fatalf("steps = %v", steps)
	}
}

func TestReloadFailureIsRevertedAndRootStays(t *testing.T) {
	fake := hardenedMachine(t)
	delete(fake.Units, "ssh")

	result, steps := events(fake, t, Options{})

	if result.RootClosed || !strings.Contains(result.Reason, "reloading sshd failed") || !strings.Contains(result.Reason, "could not be reloaded either") {
		t.Fatalf("result = %+v", result)
	}

	if strings.Join(steps[len(steps)-3:], " ") != "reload-sshd=fail revert-sshd-fragment=ok restore-sshd=ok" {
		t.Fatalf("steps = %v", steps)
	}

	if _, present := fake.Files[FragmentPath]; present {
		t.Fatal("fragment must be removed when sshd cannot reload")
	}
}

// The fragment going back on disk is not enough: sshd must be reloaded on it, or it keeps running on the configuration that was just refused.
func TestReloadFailureReloadsSshdOnThePreviousFragment(t *testing.T) {
	fake := hardenedMachine(t)
	fake.FailOnce("systemctl", "Job for ssh.service failed because the control process exited with error code.")

	result, steps := events(fake, t, Options{})

	if result.RootClosed || !strings.Contains(result.Reason, "sshd reloaded on the previous configuration") || strings.Contains(result.Reason, "either") {
		t.Fatalf("result = %+v", result)
	}

	if strings.Join(steps[len(steps)-3:], " ") != "reload-sshd=fail revert-sshd-fragment=ok restore-sshd=ok" {
		t.Fatalf("steps = %v", steps)
	}

	if _, present := fake.Files[FragmentPath]; present || fake.Restarts["ssh"] != 1 {
		t.Fatalf("fragment present %v, ssh reloaded %d time(s): sshd must be reloaded once the fragment is reverted", present, fake.Restarts["ssh"])
	}
}

func TestKeepRootAppliesTheFragmentAndLeavesRootAWayIn(t *testing.T) {
	keep := Options{KeepRoot: true}
	fake := machine(t, keep)

	result, steps := events(fake, t, keep)

	if result.RootClosed || !result.RootKept || result.NextUser != "dev" || result.Reason != "" {
		t.Fatalf("result = %+v", result)
	}

	if strings.Join(steps, " ") != "protect-links=skip check-authorized-keys=ok write-sshd-fragment=ok validate-sshd-config=ok reload-sshd=ok confirm-sshd-config=ok" {
		t.Fatalf("steps = %v", steps)
	}

	fragment := string(fake.Files[FragmentPath])
	for _, want := range []string{"PermitRootLogin prohibit-password\n", "AllowUsers dev root\n", "PasswordAuthentication no\n"} {
		if !strings.Contains(fragment, want) {
			t.Errorf("fragment = %q, misses %q", fragment, want)
		}
	}

	result, steps = events(fake, t, keep)

	if result.RootClosed || !result.RootKept || strings.Join(steps, " ") != "protect-links=skip check-authorized-keys=ok write-sshd-fragment=skip" {
		t.Fatalf("replay: result %+v, steps %v", result, steps)
	}
}

func TestKeepRootStillNeedsAKeyOnDev(t *testing.T) {
	keep := Options{KeepRoot: true}
	fake := machine(t, keep)
	delete(fake.Files, authorizedKeysPath)

	result, _ := events(fake, t, keep)

	if result.RootClosed || result.RootKept || result.NextUser != "root" || !strings.Contains(result.Reason, "no key in /home/dev/.ssh/authorized_keys") {
		t.Fatalf("result = %+v", result)
	}
}

func TestHardenConfirmsTheEffectiveConfigurationAfterReload(t *testing.T) {
	fake := hardenedMachine(t)

	_, steps := events(fake, t, Options{})

	if strings.Join(steps, " ") != "protect-links=skip check-authorized-keys=ok write-sshd-fragment=ok validate-sshd-config=ok reload-sshd=ok confirm-sshd-config=ok" {
		t.Fatalf("steps = %v", steps)
	}

	commands := strings.Join(fake.Commands(), "\n")
	if !strings.Contains(commands, "sshd -T -C user=dev") {
		t.Fatalf("the effective configuration must be read back:\n%s", commands)
	}
}

// An image whose sshd_config carries no Include passes sshd -t and ignores the fragment: root would be said closed while still open.
func TestHardenRevertsWhenSshdIgnoresTheFragment(t *testing.T) {
	fake := hardenedMachine(t)
	fake.Files["/etc/ssh/sshd_config"] = []byte("PermitRootLogin yes\n")

	result, steps := events(fake, t, Options{})

	if result.RootClosed || result.NextUser != "root" || !strings.Contains(result.Reason, "Include /etc/ssh/sshd_config.d/*.conf") {
		t.Fatalf("result = %+v", result)
	}

	if steps[len(steps)-3] != "confirm-sshd-config=fail" || steps[len(steps)-2] != "revert-sshd-fragment=ok" || steps[len(steps)-1] != "restore-sshd=ok" {
		t.Fatalf("steps = %v", steps)
	}

	if _, present := fake.Files[FragmentPath]; present {
		t.Fatal("a fragment sshd does not read must not stay, or the next harden would call root closed")
	}
}

func TestHardenRefusesAKeyDirectorySshdWouldNotTrust(t *testing.T) {
	for name, prepare := range map[string]func(fake *modtest.FakeSys){
		"owned by another user": func(fake *modtest.FakeSys) { fake.Owners["/home/dev/.ssh"] = "www-data:www-data" },
		"group writable":        func(fake *modtest.FakeSys) { fake.Modes["/home/dev/.ssh"] = 0o770 },
		"keys owned by another": func(fake *modtest.FakeSys) { fake.Owners[authorizedKeysPath] = "www-data:www-data" },
	} {
		t.Run(name, func(t *testing.T) {
			fake := hardenedMachine(t)
			prepare(fake)
			mutations := len(fake.Mutations)

			result, _ := events(fake, t, Options{})

			if result.RootClosed || result.NextUser != "root" || !strings.Contains(result.Reason, "StrictModes") {
				t.Fatalf("result = %+v", result)
			}

			if len(fake.Mutations) != mutations {
				t.Fatalf("mutations = %v", fake.Mutations[mutations:])
			}
		})
	}
}
