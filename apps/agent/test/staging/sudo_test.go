//go:build staging

package staging

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/sudo"
)

const (
	stagingSudoPassword = "k7mp-q2xw-9hdt-3vzc-u8fa-6rne"
	stagingSudoHash     = "$6$rounds=100000$Wq3vX8zYk1pL0sQe$PrJH1rPtYcXhyW28FJS0rQ7sq5jLB9mY/GZ8GL1MQMXesQF1UBBe.X8g.Z1cutPJzEeignRlhLB1GHAcUHivm."
	sudoMarker          = "pupitre-sudo:"
)

var sudoRequest = request{Cmd: "harden.sudo", Params: map[string]any{"user": "dev", "secrets_stdin": true}}

var trustRequest = request{Cmd: "keys.trust", Params: map[string]any{"public_key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIIpnKVP1oHEgOAeBppA7YR+8vwKg5ylIyTLxWKT7IaS"}}

// The other staging tests need sudo -n, so the open rule is put back with the password this test set.
func restoreOpenSudo(t *testing.T, dev string) {
	t.Helper()

	command := sshCommand(dev, "sudo", "-S", "-k", "-p", "''", "sh", "-c", "'printf \"%s\\n\" \""+strings.TrimSpace(sudo.Open)+"\" > "+sudo.Path+"'")
	command.Stdin = strings.NewReader(stagingSudoPassword + "\n")

	if out, err := command.CombinedOutput(); err != nil {
		t.Errorf("the open rule could not be put back: %v\n%s", err, out)
	}
}

func limitedSession(t *testing.T, dev string, requests ...request) []response {
	t.Helper()

	return converseOn(t, sshCommand(dev, "sudo", "-n", "pupitred", "serve"), "", requests...)
}

func privilegedSession(t *testing.T, dev string, requests ...request) []response {
	t.Helper()

	return converseOn(t, sshCommand(dev, "sudo", "-S", "-p", "'"+sudoMarker+"'", "pupitred", "serve", "--privileged"), stagingSudoPassword, requests...)
}

func refusedFor(t *testing.T, resp response) string {
	t.Helper()

	if resp.OK {
		t.Fatalf("expected a refusal, got %s", resp.Result)
	}

	return decode[struct{ Code string }](t, resp.Error).Code
}

func TestSudoAsksDevForAPasswordButPupitred(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	if !reachable(dev) {
		agent(t, host, request{Cmd: "harden", Params: map[string]any{"user": "dev"}})
	}

	t.Cleanup(func() { restoreOpenSudo(t, dev) })

	resp := agentWithSecrets(t, dev, `{"password_hash":"`+stagingSudoHash+`"}`, sudoRequest)[0]
	if result := decode[struct{ Sudo string }](t, resp.Result); result.Sudo != "password" {
		t.Fatalf("harden.sudo = %s, events %v", resp.Result, resp.Events)
	}

	readRule := sshCommand(dev, "sudo", "-S", "-k", "-p", "''", "cat", sudo.Path)
	readRule.Stdin = strings.NewReader(stagingSudoPassword + "\n")

	if rule, err := readRule.Output(); err != nil || string(rule) != sudo.Restricted {
		t.Fatalf("sudoers = %q (%v)", rule, err)
	}

	for _, argv := range [][]string{
		{"true"},
		{"pupitred", "version"},
		{"pupitred", "serve", "--privileged", "</dev/null"},
		{"pupitred", "keys", "reset", "--key", "'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIIpnKVP1oHEgOAeBppA7YR+8vwKg5ylIyTLxWKT7IaS'"},
		{"pupitred", "migrate", "--status"},
		{"pupitred", "dev", "status"},
		{"/usr/local/bin/pupitred", "serve", "--privileged", "</dev/null"},
	} {
		if out, err := sshCommand(dev, append([]string{"sudo", "-n", "-k"}, argv...)...).CombinedOutput(); err == nil {
			t.Fatalf("sudo -n %s ran without a password:\n%s", strings.Join(argv, " "), out)
		}
	}

	withPassword := sshCommand(dev, "sudo", "-S", "-k", "-p", "''", "true")
	withPassword.Stdin = strings.NewReader(stagingSudoPassword + "\n")

	if out, err := withPassword.CombinedOutput(); err != nil {
		t.Fatalf("the password set by harden.sudo does not open sudo: %v\n%s", err, out)
	}

	limited := limitedSession(t, dev,
		request{Cmd: "snapshot"},
		trustRequest,
		request{Cmd: "harden.sudo", Params: map[string]any{"user": "dev", "secrets_stdin": true}, Secrets: `{"password_hash":"` + stagingSudoHash + `"}`},
		request{Cmd: "service.secret", Params: map[string]any{"id": "core.system", "key": "PUPITRE_DOMAIN"}},
		request{Cmd: "agent.upgrade", Params: map[string]any{"version": "0.0.1", "allow_downgrade": true}},
	)

	if machine := decode[contract.Snapshot](t, limited[0].Result).Machine; machine.Sudo != contract.SudoPassword {
		t.Fatalf("snapshot says sudo %q", machine.Sudo)
	}

	for i, cmd := range []string{"keys.trust", "harden.sudo", "service.secret", "agent.upgrade"} {
		if code := refusedFor(t, limited[i+1]); code != string(contract.ErrorPrivilegeRequired) {
			t.Fatalf("%s on the limited session: %s", cmd, code)
		}
	}

	replay := privilegedSession(t, dev, request{Cmd: "harden.sudo", Params: map[string]any{"user": "dev", "secrets_stdin": true}, Secrets: `{"password_hash":"` + stagingSudoHash + `"}`})[0]
	if !replay.OK {
		t.Fatalf("harden.sudo on the privileged session: %s", replay.Error)
	}

	for _, step := range []string{"core.hardening·set-password", "core.hardening·restrict-sudo"} {
		if !contains(steps(replay, contract.StepSkip), step) {
			t.Fatalf("a replay must skip %s: %v", step, replay.Events)
		}
	}

	if report := limitedSession(t, dev, request{Cmd: "report"})[0]; strings.Contains(string(report.Result), stagingSudoHash) {
		t.Fatal("the hash reached the report")
	}

	if out := ssh(t, dev, "pupitred", "dev", "status", "--json"); !strings.Contains(out, `"services"`) {
		t.Fatalf("pupitred dev status as dev: %q", out)
	}
}

// The passwordless sudo line accepts only release-signed binaries; a build without the release key needs --privileged.
func TestPupitredPlacesAPushedBinaryAsDev(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	if !reachable(dev) {
		t.Skip("dev is not open yet: run the hardening first")
	}

	version := strings.TrimPrefix(strings.TrimSpace(ssh(t, dev, "pupitred", "version")), "pupitred ")

	push := func(flags string) (string, error) {
		line := `'{ printf "%s\n" "{\"version\":\"` + version + `\"}"; cat /usr/local/bin/pupitred; } | sudo -n /usr/local/bin/pupitred binary install` + flags + `'`
		out, err := sshCommand(dev, "sh", "-c", line).CombinedOutput()

		return string(out), err
	}

	unsigned, err := push("")
	if err == nil {
		t.Fatalf("an unsigned binary was placed on the line sudo runs without a password: %q", unsigned)
	}

	if !strings.Contains(unsigned, string(contract.ErrorPrivilegeRequired)) {
		t.Skipf("this agent carries the release key; nothing left to check without a signature: %q", unsigned)
	}

	out, err := push(" --privileged")
	if err != nil || !strings.HasSuffix(strings.TrimSpace(out), "  /usr/local/bin/pupitred") {
		t.Fatalf("binary install --privileged under the rule of before = %q (%v)", out, err)
	}
}
