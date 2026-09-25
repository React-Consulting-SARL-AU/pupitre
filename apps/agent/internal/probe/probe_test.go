package probe

import (
	"reflect"
	"strings"
	"testing"
)

func probeFixture(t *testing.T, f fixture) Result {
	t.Helper()

	return Run(f.options(t, t.TempDir()))
}

func TestBareUbuntuReadsTheWholeMachine(t *testing.T) {
	result := probeFixture(t, bareUbuntu())

	if result.OS != "ubuntu" || result.Version != "24.04" || result.Arch != "amd64" {
		t.Fatalf("distribution = %s %s %s", result.OS, result.Version, result.Arch)
	}

	if result.RAMMB != 7938 {
		t.Fatalf("ram_mb = %d, want the total of free -b in mebibytes", result.RAMMB)
	}

	if result.DiskFreeGB != "40.0" {
		t.Fatalf("disk_free_gb = %s", result.DiskFreeGB)
	}

	if !result.Sudo || result.Docker || result.Panel != nil || result.AgentVersion != nil {
		t.Fatalf("unexpected machine %+v", result)
	}

	if !reflect.DeepEqual(result.Ports, []Port{{Port: 22, Process: "sshd"}}) {
		t.Fatalf("ports = %+v", result.Ports)
	}

	if len(result.InstalledModules) != 0 {
		t.Fatalf("installed_modules = %q", result.InstalledModules)
	}

	if result.Verdict.Kind != KindBare {
		t.Fatalf("verdict = %+v", result.Verdict)
	}
}

func TestUbuntuWithDockerAndASiteOnEightyIsOccupied(t *testing.T) {
	f := bareUbuntu()
	f.Dirs = []string{"/var/lib/docker"}
	f.Files["/usr/bin/docker"] = "binary\n"
	f.Replies["ss -ltnp"] = `State  Recv-Q Send-Q     Local Address:Port  Peer Address:Port Process
LISTEN 0      128              0.0.0.0:22         0.0.0.0:*     users:(("sshd",pid=901,fd=3))
LISTEN 0      511              0.0.0.0:80         0.0.0.0:*     users:(("nginx",pid=1042,fd=6))
LISTEN 0      511                 [::]:80            [::]:*     users:(("nginx",pid=1042,fd=7))
`

	result := probeFixture(t, f)

	if !result.Docker {
		t.Fatal("docker must be seen")
	}

	if !reflect.DeepEqual(result.Ports, []Port{{Port: 22, Process: "sshd"}, {Port: 80, Process: "nginx"}}) {
		t.Fatalf("ports = %+v", result.Ports)
	}

	if result.Verdict.Kind != KindOccupied || result.Verdict.Level != LevelWarning {
		t.Fatalf("verdict = %+v", result.Verdict)
	}

	reasons := strings.Join(result.Verdict.Reasons, "\n")
	if !strings.Contains(reasons, "Docker") || !strings.Contains(reasons, "Port 80") || !strings.Contains(reasons, "nginx") {
		t.Fatalf("the verdict must list what would be touched:\n%s", reasons)
	}
}

func TestDebianIsIncompatible(t *testing.T) {
	f := bareUbuntu()
	f.Files["/etc/os-release"] = "PRETTY_NAME=\"Debian GNU/Linux 12 (bookworm)\"\nID=debian\nVERSION_ID=\"12\"\n"

	result := probeFixture(t, f)

	if result.OS != "debian" || result.Version != "12" {
		t.Fatalf("distribution = %s %s", result.OS, result.Version)
	}

	if result.Verdict.Kind != KindIncompatible || result.Verdict.Level != LevelBlocked {
		t.Fatalf("verdict = %+v", result.Verdict)
	}

	if !strings.Contains(result.Verdict.Reasons[0], "debian 12") || len(result.Verdict.Fixes) != 1 {
		t.Fatalf("verdict = %+v", result.Verdict)
	}
}

func TestManagedMachineReadsTheAgentAndItsModules(t *testing.T) {
	f := bareUbuntu()
	f.Agent = "0.1.0"
	f.Files["/var/lib/pupitre/report.json"] = `{"modules":[{"id":"core.system","status":"ok","steps":[]},{"id":"core.hardening","status":"ok","steps":[]}],"failed":[],"warned":[]}`

	result := probeFixture(t, f)

	if result.AgentVersion == nil || *result.AgentVersion != "0.1.0" {
		t.Fatalf("agent_version = %v", result.AgentVersion)
	}

	if !reflect.DeepEqual(result.InstalledModules, []string{"core.system", "core.hardening"}) {
		t.Fatalf("installed_modules = %q", result.InstalledModules)
	}

	if result.Verdict.Kind != KindManaged || result.Verdict.UpToDate == nil || *result.Verdict.UpToDate {
		t.Fatalf("verdict = %+v", result.Verdict)
	}
}

func TestWithoutPasswordlessSudoTheMachineIsBlocked(t *testing.T) {
	f := bareUbuntu()
	f.Failing = []string{"sudo"}

	result := probeFixture(t, f)

	if result.Sudo || result.Verdict.Kind != KindIncompatible {
		t.Fatalf("sudo = %v, verdict = %+v", result.Sudo, result.Verdict)
	}
}

func TestPortsFallBackToNetstat(t *testing.T) {
	f := bareUbuntu()
	f.Absent = []string{"ss"}
	f.Replies["netstat -ltnp"] = netstatOutput

	result := probeFixture(t, f)

	if !reflect.DeepEqual(result.Ports, []Port{{Port: 22, Process: "sshd"}, {Port: 443, Process: "nginx"}, {Port: 3306}}) {
		t.Fatalf("ports = %+v", result.Ports)
	}
}

func TestMemoryFallsBackToMeminfo(t *testing.T) {
	f := bareUbuntu()
	f.Absent = []string{"free", "netstat"}

	if ram := probeFixture(t, f).RAMMB; ram != 7938 {
		t.Fatalf("ram_mb = %d, want the MemTotal of /proc/meminfo", ram)
	}
}

func TestPanelsAreDetectedByTheirDirectory(t *testing.T) {
	for dir, want := range map[string]string{
		"/usr/local/cpanel": "cPanel",
		"/usr/local/psa":    "Plesk",
		"/etc/cloudpanel":   "CloudPanel",
		"/www/server/panel": "aaPanel",
	} {
		f := bareUbuntu()
		f.Dirs = []string{dir}

		result := probeFixture(t, f)
		if result.Panel == nil || *result.Panel != want {
			t.Errorf("%s = %v, want %s", dir, result.Panel, want)
		}

		if result.Verdict.Kind != KindOccupied {
			t.Errorf("%s must occupy the machine, got %s", dir, result.Verdict.Kind)
		}
	}
}

func TestUnreadableMachineStillAnswers(t *testing.T) {
	result := probeFixture(t, fixture{Absent: fakePrograms, Current: "0.2.0"})

	if result.Verdict.Kind != KindIncompatible || len(result.Verdict.Reasons) == 0 {
		t.Fatalf("verdict = %+v", result.Verdict)
	}

	if result.Ports == nil || result.InstalledModules == nil {
		t.Fatal("ports and installed_modules must be empty lists, never null")
	}
}

func TestResultIsValidAgainstTheContract(t *testing.T) {
	for name, f := range map[string]fixture{"bare": bareUbuntu(), "managed": managedFixture()} {
		t.Run(name, func(t *testing.T) {
			assertContract(t, probeFixture(t, f))
		})
	}
}

func managedFixture() fixture {
	f := bareUbuntu()
	f.Agent = "0.2.0"
	f.Files["/var/lib/pupitre/report.json"] = `{"modules":[{"id":"core.system","status":"ok","steps":[]}],"failed":[],"warned":[]}`

	return f
}

// Decision 0015: sudo wants dev's password for everything but `pupitred serve` and `pupitred binary install`.
func securedFixture() fixture {
	f := managedFixture()
	f.FailingLines = []string{"sudo -n true", "sudo -n " + agentPlaceholder + " version"}

	return f
}

func TestADevWhomSudoLetsRunPupitredAloneStillDrivesTheMachine(t *testing.T) {
	result := probeFixture(t, securedFixture())

	if !result.Sudo || result.Verdict.Kind != KindManaged {
		t.Fatalf("sudo = %v, verdict = %+v", result.Sudo, result.Verdict)
	}
}

// Without an agent there is nothing sudo lets through: a password-only account cannot install one.
func TestAPasswordOnlySudoWithoutAnAgentIsBlocked(t *testing.T) {
	f := bareUbuntu()
	f.FailingLines = []string{"sudo -n true"}

	result := probeFixture(t, f)

	if result.Sudo || result.Verdict.Kind != KindIncompatible {
		t.Fatalf("sudo = %v, verdict = %+v", result.Sudo, result.Verdict)
	}
}
