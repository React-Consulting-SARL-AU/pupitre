//go:build staging

package staging

import (
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
)

const authorizedKeys = "/home/dev/.ssh/authorized_keys"

var coreInstall = request{Cmd: "install", Params: map[string]any{
	"modules":       []string{"core.system", "core.hardening"},
	"secrets_stdin": false,
	"config": map[string]any{
		"core.system":    map[string]any{"timezone": "Europe/Paris", "git_name": "Pupitre Staging", "git_email": "staging@pupitre.studio"},
		"core.hardening": map[string]any{"ssh_443": false},
	},
}}

func TestInstallCoreOpensDevWithSudo(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	first := agent(t, host, coreInstall)[0]
	result := decode[contract.InstallResult](t, first.Result)
	if len(result.Failed) != 0 {
		t.Fatalf("install failed: %v", result.Failed)
	}

	if !reachable(dev) {
		t.Fatal("ssh dev@staging true must work with the client's key after install core.*")
	}

	if out := ssh(t, dev, "sudo", "-n", "true"); strings.TrimSpace(out) != "" {
		t.Fatalf("sudo -n true printed %q", out)
	}

	if out := ssh(t, dev, "zsh", "-ic", "'echo $PROJECTS_DIR'"); !strings.Contains(out, "/home/dev/projects") {
		t.Fatalf("zsh must export PROJECTS_DIR: %q", out)
	}

	var replay response
	elapsed := timed(t, "install replay", func() { replay = agent(t, host, coreInstall)[0] })
	if changed := steps(replay, contract.StepOK); len(changed) != 0 || elapsed > 30*time.Second {
		t.Fatalf("replay must only skip in under 30 s: %v in %s", changed, elapsed)
	}
}

const reloadSSHD = "systemctl daemon-reload && if systemctl is-active --quiet ssh.socket; then systemctl restart ssh.socket ssh.service; else systemctl reload ssh; fi"

// A port sshd listens on besides 22 stays reachable once ufw denies the rest, and fail2ban watches it.
func TestHardeningAllowsEveryPortSSHDListensOn(t *testing.T) {
	host := stagingHost(t)
	dropIn := "/etc/ssh/sshd_config.d/20-staging-port.conf"

	ssh(t, host, "printf 'Port 22\\nPort 2200\\n' > "+dropIn+" && "+reloadSSHD)
	defer ssh(t, host, "rm -f "+dropIn+" && "+reloadSSHD+" && ufw delete allow 2200/tcp")

	if failed := decode[contract.InstallResult](t, agent(t, host, coreInstall)[0].Result).Failed; len(failed) != 0 {
		t.Fatalf("install failed: %v", failed)
	}

	if out := ssh(t, host, "ufw", "status"); !strings.Contains(out, "Status: active") || !strings.Contains(out, "22/tcp") || !strings.Contains(out, "2200/tcp") {
		t.Fatalf("ufw must allow every port sshd listens on:\n%s", out)
	}

	if out := ssh(t, host, "cat", "/etc/fail2ban/jail.d/pupitre.local"); !strings.Contains(out, "port = 22,2200") {
		t.Fatalf("the jail must watch every port sshd listens on:\n%s", out)
	}

	if !reachable(host) {
		t.Fatal("the machine must stay reachable once the firewall is up")
	}
}

func TestHardenWithoutKeyKeepsRoot(t *testing.T) {
	host := stagingHost(t)

	ssh(t, host, "mv", authorizedKeys, authorizedKeys+".aside")
	defer ssh(t, host, "mv", authorizedKeys+".aside", authorizedKeys)

	resp := agent(t, host, request{Cmd: "harden", Params: map[string]any{"user": "dev"}})[0]
	result := decode[struct {
		RootClosed bool   `json:"root_closed"`
		NextUser   string `json:"next_user"`
		Reason     string `json:"reason"`
	}](t, resp.Result)

	if result.RootClosed || result.NextUser != "root" || !strings.Contains(result.Reason, "authorized_keys") {
		t.Fatalf("harden without key = %+v", result)
	}

	if !reachable(host) {
		t.Fatal("root must stay reachable when dev has no key")
	}

	if out := ssh(t, host, "ls", "/etc/ssh/sshd_config.d/"); strings.Contains(out, "10-pupitre.conf") {
		t.Fatal("no sshd fragment may be written without a key")
	}
}

var coreInstallKeepingRoot = request{Cmd: "install", Params: map[string]any{
	"modules":       []string{"core.system", "core.hardening"},
	"secrets_stdin": false,
	"config": map[string]any{
		"core.system":    map[string]any{"timezone": "Europe/Paris", "git_name": "Pupitre Staging", "git_email": "staging@pupitre.studio"},
		"core.hardening": map[string]any{"ssh_443": false, "keep_root": true},
	},
}}

// Runs before the test that closes root for good, and puts the default configuration back so that one still has root to close.
func TestHardenKeepsRootWhenTheConfigurationAsksForIt(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	if failed := decode[contract.InstallResult](t, agent(t, host, coreInstallKeepingRoot)[0].Result).Failed; len(failed) != 0 {
		t.Fatalf("install failed: %v", failed)
	}

	resp := agent(t, host, request{Cmd: "harden", Params: map[string]any{"user": "dev"}})[0]
	result := decode[struct {
		RootClosed bool   `json:"root_closed"`
		RootKept   bool   `json:"root_kept"`
		NextUser   string `json:"next_user"`
	}](t, resp.Result)

	if result.RootClosed || !result.RootKept || result.NextUser != "dev" {
		t.Fatalf("harden = %+v, events %v", result, resp.Events)
	}

	if !reachable(host) || !reachable(dev) {
		t.Fatal("root and dev must both be reachable when the configuration keeps root")
	}

	if out := ssh(t, host, "cat", "/etc/ssh/sshd_config.d/10-pupitre.conf"); !strings.Contains(out, "PermitRootLogin prohibit-password") || !strings.Contains(out, "PasswordAuthentication no") {
		t.Fatalf("fragment must let root back in by key only:\n%s", out)
	}

	if failed := decode[contract.InstallResult](t, agent(t, host, coreInstall)[0].Result).Failed; len(failed) != 0 {
		t.Fatalf("restoring the default configuration failed: %v", failed)
	}
}

func TestHardenClosesRootAndReplaysWithoutWriting(t *testing.T) {
	host := stagingHost(t)
	dev := "dev@" + address(host)

	resp := agent(t, host, request{Cmd: "harden", Params: map[string]any{"user": "dev"}})[0]
	result := decode[struct {
		RootClosed bool   `json:"root_closed"`
		NextUser   string `json:"next_user"`
	}](t, resp.Result)
	if !result.RootClosed || result.NextUser != "dev" {
		t.Fatalf("harden = %+v, events %v", result, resp.Events)
	}

	if !reachable(dev) {
		t.Fatal("dev must still be reachable after harden")
	}

	if reachable(host) {
		t.Fatal("root must be refused after harden")
	}

	replay := agent(t, dev, request{Cmd: "harden", Params: map[string]any{"user": "dev"}})[0]
	if written := steps(replay, contract.StepOK); len(written) != 1 || written[0] != "core.hardening·check-authorized-keys" {
		t.Fatalf("harden replay rewrote something: %v", written)
	}

	if out := ssh(t, dev, "cat", "/etc/sysctl.d/60-pupitre-links.conf"); !strings.Contains(out, "fs.protected_hardlinks = 1\nfs.protected_symlinks = 1\n") {
		t.Fatalf("harden must pin the link protections:\n%s", out)
	}

	if out := ssh(t, dev, "sudo", "-n", "ufw", "status"); !strings.Contains(out, "Status: active") || !strings.Contains(out, "22/tcp") {
		t.Fatalf("ufw must be active on 22/tcp:\n%s", out)
	}

	if out := ssh(t, dev, "sudo", "-n", "fail2ban-client", "status", "sshd"); !strings.Contains(out, "sshd") {
		t.Fatalf("fail2ban sshd jail must run:\n%s", out)
	}
}
