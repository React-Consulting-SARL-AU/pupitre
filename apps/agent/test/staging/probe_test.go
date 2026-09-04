//go:build staging

package staging

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/probe"
)

// probe.sh is what the app sends before anything is installed: it must run in memory, on a machine
// that has never seen pupitred, and answer exactly what the Go probe answers on the same machine.
func TestShellProbeMatchesTheAgentProbe(t *testing.T) {
	host := stagingHost(t)

	shell := shellProbe(t, host)
	agentSide := agent(t, host, request{Cmd: "probe"})[0]

	var fromShell, fromAgent probe.Result
	if err := json.Unmarshal(shell, &fromShell); err != nil {
		t.Fatalf("probe.sh did not print a Probe: %v\n%s", err, shell)
	}
	if err := json.Unmarshal(agentSide.Result, &fromAgent); err != nil {
		t.Fatal(err)
	}

	if fromShell.OS != fromAgent.OS || fromShell.Version != fromAgent.Version || fromShell.Arch != fromAgent.Arch {
		t.Fatalf("distribution disagrees: %+v vs %+v", fromShell, fromAgent)
	}

	if fromShell.Sudo != fromAgent.Sudo || fromShell.Docker != fromAgent.Docker {
		t.Fatalf("sudo or docker disagree: %+v vs %+v", fromShell, fromAgent)
	}

	if fromShell.Verdict.Kind != fromAgent.Verdict.Kind {
		t.Fatalf("verdicts disagree: %s vs %s", fromShell.Verdict.Kind, fromAgent.Verdict.Kind)
	}
}

// A staging VPS is reinstalled from a plain Ubuntu image: nothing on it should read as occupied.
func TestFreshStagingReadsAsBare(t *testing.T) {
	host := stagingHost(t)

	var result probe.Result
	if err := json.Unmarshal(shellProbe(t, host), &result); err != nil {
		t.Fatal(err)
	}

	if result.OS != "ubuntu" || (result.Version != "22.04" && result.Version != "24.04") {
		t.Fatalf("staging must run a supported Ubuntu, got %s %s", result.OS, result.Version)
	}

	if result.Verdict.Kind != probe.KindBare {
		t.Fatalf("verdict = %s, reasons %q", result.Verdict.Kind, result.Verdict.Reasons)
	}

	if result.RAMMB < probe.MinRAMMB || result.DiskFreeGB == "0.0" {
		t.Fatalf("staging is too small to install on: %d MB, %s GB", result.RAMMB, result.DiskFreeGB)
	}
}

// Once the agent is installed the same machine reads as managed, and names the modules it carries.
func TestInstalledStagingReadsAsManaged(t *testing.T) {
	host := stagingHost(t)
	agent(t, host, coreInstall)

	var result probe.Result
	if err := json.Unmarshal(shellProbe(t, host), &result); err != nil {
		t.Fatal(err)
	}

	if result.Verdict.Kind != probe.KindManaged || result.AgentVersion == nil {
		t.Fatalf("verdict = %+v, agent = %v", result.Verdict, result.AgentVersion)
	}

	if !contains(result.InstalledModules, "core.system") {
		t.Fatalf("installed_modules = %q", result.InstalledModules)
	}
}

// The script is piped into a shell, never written down: nothing of it may survive on the machine.
func TestShellProbeLeavesNothingBehind(t *testing.T) {
	host := stagingHost(t)

	shellProbe(t, host)

	for _, path := range []string{"/tmp/probe.sh", "/root/probe.sh"} {
		if out := ssh(t, host, "test", "-e", path, "||", "true"); strings.Contains(out, "probe") {
			t.Fatalf("%s survived the probe: %s", path, out)
		}
	}
}

func shellProbe(t *testing.T, host string) []byte {
	t.Helper()

	cmd := sshCommand(host, "sh", "-s", "--", "--version="+agentVersion(t, host))
	cmd.Stdin = strings.NewReader(probe.Script)

	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr

	if err := cmd.Run(); err != nil {
		t.Fatalf("ssh %s 'sh -s' < probe.sh: %v\n%s", host, err, stderr.String())
	}

	if stderr.Len() > 0 {
		t.Fatalf("probe.sh wrote on stderr:\n%s", stderr.String())
	}

	return stdout.Bytes()
}

func agentVersion(t *testing.T, host string) string {
	t.Helper()

	out := ssh(t, host, "pupitred", "version")
	fields := strings.Fields(strings.TrimSpace(out))
	if len(fields) == 0 {
		t.Fatalf("pupitred version printed nothing")
	}

	return fields[len(fields)-1]
}

func contains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}

	return false
}
