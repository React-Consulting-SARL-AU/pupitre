package hardening

import (
	"strings"
	"testing"

	"pupitre.sh/agent/internal/contract"
	"pupitre.sh/agent/internal/modules/modtest"
)

const (
	devKey             = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILykUfO8a7qKBQHbW/KSfnaTtl1nAJxVpOzifJBri1Hl jordan@laptop"
	authorizedKeysPath = "/home/dev/.ssh/authorized_keys"
)

func hardenedMachine(t *testing.T) *modtest.FakeSys {
	t.Helper()

	fake := modtest.NewFakeSys()
	fake.Users["dev"] = "/home/dev"
	fake.Units["ssh"] = modtest.UnitActive
	fake.Files[authorizedKeysPath] = []byte(devKey + "\n")
	run(t, newContext(t, fake, false))

	return fake
}

func events(fake *modtest.FakeSys, t *testing.T, ssh443 bool, name string) (Result, []string) {
	t.Helper()

	ctx := newContext(t, fake, ssh443)
	result := Harden(ctx, name)

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

	result, steps := events(fake, t, false, "dev")

	if result.RootClosed || result.NextUser != "root" || !strings.Contains(result.Reason, "aucune clé dans /home/dev/.ssh/authorized_keys") {
		t.Fatalf("result = %+v", result)
	}

	if strings.Join(steps, " ") != "check-authorized-keys=ok" || len(fake.Mutations) != mutations {
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

	result, _ := events(fake, t, false, "dev")

	if result.RootClosed || !strings.Contains(result.Reason, "aucune clé bien formée") || !strings.Contains(result.Reason, "2 ligne(s) illisible(s)") {
		t.Fatalf("result = %+v", result)
	}

	if len(fake.Mutations) != mutations {
		t.Fatalf("mutations = %v", fake.Mutations[mutations:])
	}
}

func TestHardenWithoutUserKeepsRoot(t *testing.T) {
	fake := hardenedMachine(t)
	delete(fake.Users, "dev")

	result, _ := events(fake, t, false, "dev")
	if result.RootClosed || !strings.Contains(result.Reason, "l'utilisateur dev n'existe pas") {
		t.Fatalf("result = %+v", result)
	}
}

func TestHardenClosesRootThenReplaysWithoutWriting(t *testing.T) {
	fake := hardenedMachine(t)

	result, steps := events(fake, t, false, "dev")

	if !result.RootClosed || result.NextUser != "dev" || result.Reason != "" {
		t.Fatalf("result = %+v", result)
	}

	if strings.Join(steps, " ") != "check-authorized-keys=ok write-sshd-fragment=ok validate-sshd-config=ok reload-sshd=ok" {
		t.Fatalf("steps = %v", steps)
	}

	if string(fake.Files[FragmentPath]) != string(Fragment(false)) || fake.Modes[FragmentPath] != 0o644 {
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
	result, steps = events(fake, t, false, "dev")

	if !result.RootClosed || strings.Join(steps, " ") != "check-authorized-keys=ok write-sshd-fragment=skip" || len(fake.Mutations) != mutations || fake.Restarts["ssh"] != 1 {
		t.Fatalf("replay: result %+v, steps %v, mutations %v", result, steps, fake.Mutations[mutations:])
	}
}

func TestHardenUsesThePreparedFragmentAndRestartsTheSocketFor443(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Users["dev"] = "/home/dev"
	fake.Units["ssh.socket"] = modtest.UnitActive
	fake.Units["ssh.service"] = modtest.UnitActive
	fake.Files[authorizedKeysPath] = []byte(devKey + "\n")
	run(t, newContext(t, fake, true))

	result, _ := events(fake, t, true, "dev")

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

	result, steps := events(fake, t, false, "dev")

	if result.RootClosed || result.NextUser != "root" || !strings.Contains(result.Reason, "configuration sshd invalide, fragment retiré") || !strings.Contains(result.Reason, "Bad configuration option") {
		t.Fatalf("result = %+v", result)
	}

	if strings.Join(steps, " ") != "check-authorized-keys=ok write-sshd-fragment=ok validate-sshd-config=fail revert-sshd-fragment=ok" {
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
	Harden(newContext(t, fake, false), "dev")
	run(t, newContext(t, fake, true))
	fake.FailProgram("sshd", "Port: bad port number")

	result, steps := events(fake, t, true, "dev")

	if result.RootClosed || string(fake.Files[FragmentPath]) != string(Fragment(false)) {
		t.Fatalf("result %+v, fragment %q", result, fake.Files[FragmentPath])
	}

	if steps[len(steps)-1] != "revert-sshd-fragment=ok" {
		t.Fatalf("steps = %v", steps)
	}
}

func TestReloadFailureIsRevertedAndRootStays(t *testing.T) {
	fake := hardenedMachine(t)
	delete(fake.Units, "ssh")

	result, steps := events(fake, t, false, "dev")

	if result.RootClosed || !strings.Contains(result.Reason, "rechargement de sshd en échec") {
		t.Fatalf("result = %+v", result)
	}

	if steps[len(steps)-2] != "reload-sshd=fail" || steps[len(steps)-1] != "revert-sshd-fragment=ok" {
		t.Fatalf("steps = %v", steps)
	}

	if _, present := fake.Files[FragmentPath]; present {
		t.Fatal("fragment must be removed when sshd cannot reload")
	}
}
