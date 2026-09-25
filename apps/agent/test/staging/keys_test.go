//go:build staging

package staging

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/keys"
)

type listedKeys struct {
	Keys []struct {
		Fingerprint string `json:"fingerprint"`
		Signer      bool   `json:"signer"`
	} `json:"keys"`
}

func (l listedKeys) signer(fingerprint string) bool {
	for _, key := range l.Keys {
		if key.Fingerprint == fingerprint {
			return key.Signer
		}
	}

	return false
}

// The files the test rewrites go back as they were, whatever it finds on the way.
func keptAsItWas(t *testing.T, host, path string) {
	t.Helper()

	before := ssh(t, host, "sudo", "-n", "sh", "-c", "'cat "+path+" 2>/dev/null || true'")

	t.Cleanup(func() {
		command := sshCommand(host, "sudo", "-n", "tee", path)
		if before == "" {
			command = sshCommand(host, "sudo", "-n", "rm", "-f", path)
		}
		command.Stdin = strings.NewReader(before)

		if out, err := command.CombinedOutput(); err != nil {
			t.Errorf("%s not put back: %v\n%s", path, err, out)
		}
	})
}

// The reset lays the key that already opens the block, so the harness keeps its way in whatever account it uses.
func TestKeysResetThenTrustFromTheMachine(t *testing.T) {
	host := stagingHost(t)

	keptAsItWas(t, host, keys.DefaultPath)
	keptAsItWas(t, host, keys.DefaultSignersPath)

	block := ssh(t, host, "sudo", "-n", "sed", "-n", "'/# >>> pupitre keys >>>/,/# <<< pupitre keys <<</p'", keys.DefaultPath)
	var inBlock []string
	for _, line := range strings.Split(block, "\n") {
		if key, err := keys.ParsePublic(line); err == nil {
			inBlock = append(inBlock, key.Bare())
		}
	}
	if len(inBlock) != 1 {
		t.Skipf("the managed block holds %d admitted key(s); the reset is only tried on one", len(inBlock))
	}

	ssh(t, host, "sudo", "-n", "pupitred", "keys", "reset", "--key", "'"+inBlock[0]+"'")

	laid, _ := keys.ParseApproved(inBlock[0])
	listed := decode[listedKeys](t, agent(t, host, request{Cmd: "keys.list"})[0].Result)
	if len(listed.Keys) != 1 || !listed.signer(laid.Fingerprint()) {
		t.Fatalf("after the reset: %+v", listed)
	}

	if _, err := exec.LookPath("ssh-keygen"); err != nil {
		t.Skip("ssh-keygen is not installed")
	}

	private := filepath.Join(t.TempDir(), "device")
	if out, err := exec.Command("ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-C", "", "-f", private).CombinedOutput(); err != nil {
		t.Fatalf("ssh-keygen: %v\n%s", err, out)
	}
	public, _ := os.ReadFile(private + ".pub")
	device, err := keys.ParsePublic(string(public))
	if err != nil {
		t.Fatal(err)
	}

	trusted := decode[listedKeys](t, agent(t, host, request{Cmd: "keys.trust", Params: map[string]any{"public_key": device.Bare()}})[0].Result)
	if len(trusted.Keys) != 2 || !trusted.signer(device.Fingerprint()) || !trusted.signer(laid.Fingerprint()) {
		t.Fatalf("after keys.trust: %+v", trusted)
	}

	if mode := strings.TrimSpace(ssh(t, host, "sudo", "-n", "stat", "-c", "%a:%U", keys.DefaultSignersPath)); mode != "600:root" {
		t.Fatalf("signers.json is %s", mode)
	}
}
