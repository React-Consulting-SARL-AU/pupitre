package probe

import (
	"strings"
	"testing"
)

func ubuntu() Machine {
	return Machine{
		OS:         "ubuntu",
		Version:    "24.04",
		Arch:       "amd64",
		RAMMB:      8192,
		DiskFreeGB: "40.0",
		Sudo:       true,
		Current:    "0.2.0",
	}
}

func TestBareMachineIsReady(t *testing.T) {
	verdict := Decide(ubuntu())

	if verdict.Kind != KindBare || verdict.Level != LevelReady {
		t.Fatalf("verdict = %s/%s, want bare/ready", verdict.Kind, verdict.Level)
	}

	if len(verdict.Reasons) != 1 || !strings.Contains(verdict.Reasons[0], "8192 MB") {
		t.Fatalf("reasons = %q", verdict.Reasons)
	}

	if len(verdict.Fixes) != 0 || verdict.UpToDate != nil {
		t.Fatalf("a bare machine needs no fix and no version: %+v", verdict)
	}
}

func TestManagedMachineCarriesTheAgentVersion(t *testing.T) {
	machine := ubuntu()
	machine.AgentVersion = "0.2.0"

	verdict := Decide(machine)

	if verdict.Kind != KindManaged || verdict.Level != LevelReady {
		t.Fatalf("verdict = %s/%s, want managed/ready", verdict.Kind, verdict.Level)
	}

	if verdict.UpToDate == nil || !*verdict.UpToDate {
		t.Fatalf("up_to_date = %v, want true", verdict.UpToDate)
	}

	if len(verdict.Fixes) != 0 {
		t.Fatalf("an up to date agent needs no fix: %q", verdict.Fixes)
	}
}

func TestOutdatedAgentWarnsWithBothVersions(t *testing.T) {
	machine := ubuntu()
	machine.AgentVersion = "0.1.0"

	verdict := Decide(machine)

	if verdict.Kind != KindManaged || verdict.Level != LevelWarning {
		t.Fatalf("verdict = %s/%s, want managed/warning", verdict.Kind, verdict.Level)
	}

	if verdict.UpToDate == nil || *verdict.UpToDate {
		t.Fatalf("up_to_date = %v, want false", verdict.UpToDate)
	}

	if !strings.Contains(verdict.Reasons[0], "0.1.0") || !strings.Contains(verdict.Reasons[0], "0.2.0") {
		t.Fatalf("reason must carry both versions: %q", verdict.Reasons[0])
	}

	if len(verdict.Fixes) != 1 {
		t.Fatalf("fixes = %q", verdict.Fixes)
	}
}

func TestManagedWinsOverOccupied(t *testing.T) {
	machine := ubuntu()
	machine.AgentVersion = "0.2.0"
	machine.Docker = true
	machine.Users = []string{"dev"}

	if kind := Decide(machine).Kind; kind != KindManaged {
		t.Fatalf("kind = %s, want managed", kind)
	}
}

func TestOccupiedListsWhatWouldBeTouched(t *testing.T) {
	cases := []struct {
		name    string
		machine func(Machine) Machine
		expect  string
	}{
		{
			name:    "docker",
			machine: func(m Machine) Machine { m.Docker = true; return m },
			expect:  "Docker",
		},
		{
			name:    "panel",
			machine: func(m Machine) Machine { m.Panel = "cPanel"; return m },
			expect:  "cPanel",
		},
		{
			name: "port 80",
			machine: func(m Machine) Machine {
				m.Ports = []Port{{Port: 22, Process: "sshd"}, {Port: 80, Process: "nginx"}}
				return m
			},
			expect: "Port 80",
		},
		{
			name:    "users",
			machine: func(m Machine) Machine { m.Users = []string{"alice", "bob"}; return m },
			expect:  "alice, bob",
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			verdict := Decide(testCase.machine(ubuntu()))

			if verdict.Kind != KindOccupied || verdict.Level != LevelWarning {
				t.Fatalf("verdict = %s/%s, want occupied/warning", verdict.Kind, verdict.Level)
			}

			if !strings.Contains(strings.Join(verdict.Reasons, "\n"), testCase.expect) {
				t.Fatalf("reasons = %q, want one mentioning %q", verdict.Reasons, testCase.expect)
			}

			if len(verdict.Fixes) == 0 {
				t.Fatal("an occupied machine must offer a way out")
			}
		})
	}
}

func TestSSHAloneDoesNotOccupy(t *testing.T) {
	machine := ubuntu()
	machine.Ports = []Port{{Port: 22, Process: "sshd"}}

	if kind := Decide(machine).Kind; kind != KindBare {
		t.Fatalf("kind = %s, want bare", kind)
	}
}

func TestIncompatibleReasons(t *testing.T) {
	cases := []struct {
		name    string
		machine func(Machine) Machine
		expect  string
	}{
		{
			name:    "distribution",
			machine: func(m Machine) Machine { m.OS, m.Version = "debian", "12"; return m },
			expect:  "debian 12",
		},
		{
			name:    "architecture",
			machine: func(m Machine) Machine { m.Arch = "i686"; return m },
			expect:  "i686",
		},
		{
			name:    "memory",
			machine: func(m Machine) Machine { m.RAMMB = 2048; return m },
			expect:  "2048 MB",
		},
		{
			name:    "sudo",
			machine: func(m Machine) Machine { m.Sudo = false; return m },
			expect:  "sudo",
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			verdict := Decide(testCase.machine(ubuntu()))

			if verdict.Kind != KindIncompatible || verdict.Level != LevelBlocked {
				t.Fatalf("verdict = %s/%s, want incompatible/blocked", verdict.Kind, verdict.Level)
			}

			if !strings.Contains(strings.Join(verdict.Reasons, "\n"), testCase.expect) {
				t.Fatalf("reasons = %q, want one mentioning %q", verdict.Reasons, testCase.expect)
			}

			if len(verdict.Fixes) != len(verdict.Reasons) {
				t.Fatalf("each reason needs its fix: %q / %q", verdict.Reasons, verdict.Fixes)
			}
		})
	}
}

func TestSupportedUbuntuVersions(t *testing.T) {
	for version, want := range map[string]string{"20.04": KindIncompatible, "22.04": KindBare, "24.04": KindBare, "25.10": KindIncompatible} {
		machine := ubuntu()
		machine.Version = version

		if kind := Decide(machine).Kind; kind != want {
			t.Errorf("ubuntu %s = %s, want %s", version, kind, want)
		}
	}
}

func TestIncompatibleAccumulatesEveryBlocker(t *testing.T) {
	machine := ubuntu()
	machine.OS, machine.Version, machine.Arch, machine.RAMMB, machine.Sudo = "debian", "12", "i686", 1024, false

	verdict := Decide(machine)

	if len(verdict.Reasons) != 4 {
		t.Fatalf("reasons = %q, want four", verdict.Reasons)
	}
}

func TestUnknownMachineIsIncompatible(t *testing.T) {
	verdict := Decide(Machine{})

	if verdict.Kind != KindIncompatible || len(verdict.Reasons) == 0 {
		t.Fatalf("verdict = %+v", verdict)
	}
}
