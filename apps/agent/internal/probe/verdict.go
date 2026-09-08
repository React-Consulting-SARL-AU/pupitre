package probe

import (
	"pupitre.studio/agent/internal/i18n"
	"strings"
)

const (
	LevelReady   = "ready"
	LevelWarning = "warning"
	LevelBlocked = "blocked"
)

const (
	KindBare         = "bare"
	KindManaged      = "managed"
	KindOccupied     = "occupied"
	KindIncompatible = "incompatible"
)

const MinRAMMB = 4096

var (
	SupportedOS       = "ubuntu"
	SupportedVersions = []string{"22.04", "24.04"}
	SupportedArch     = []string{"amd64", "arm64"}
)

type Verdict struct {
	Level    string   `json:"level"`
	Kind     string   `json:"kind"`
	UpToDate *bool    `json:"up_to_date,omitempty"`
	Reasons  []string `json:"reasons"`
	Fixes    []string `json:"fixes"`
}

// What the two probes read; probe.sh computes the same verdict from the same facts.
type Machine struct {
	OS           string
	Version      string
	Arch         string
	RAMMB        int
	DiskFreeGB   Decimal
	Sudo         bool
	Ports        []Port
	Docker       bool
	Panel        string
	AgentVersion string
	Users        []string
	Current      string
}

func Decide(machine Machine) Verdict {
	if reasons, fixes := blockers(machine); len(reasons) > 0 {
		return Verdict{Level: LevelBlocked, Kind: KindIncompatible, Reasons: reasons, Fixes: fixes}
	}

	if machine.AgentVersion != "" {
		return managed(machine)
	}

	if reasons, fixes := occupants(machine); len(reasons) > 0 {
		return Verdict{Level: LevelWarning, Kind: KindOccupied, Reasons: reasons, Fixes: fixes}
	}

	bare := i18n.T("probe.bare", machine.OS, machine.Version, machine.Arch, machine.RAMMB, machine.DiskFreeGB)

	return Verdict{Level: LevelReady, Kind: KindBare, Reasons: []string{bare}, Fixes: []string{}}
}

func blockers(machine Machine) (reasons, fixes []string) {
	reasons, fixes = []string{}, []string{}

	if machine.OS != SupportedOS || !contains(SupportedVersions, machine.Version) {
		reasons = append(reasons, i18n.T("probe.os.unsupported", label(machine.OS+" "+machine.Version)))
		fixes = append(fixes, i18n.T("probe.os.unsupported.fix"))
	}

	if !contains(SupportedArch, machine.Arch) {
		reasons = append(reasons, i18n.T("probe.arch.unsupported", label(machine.Arch)))
		fixes = append(fixes, i18n.T("probe.arch.unsupported.fix"))
	}

	if machine.RAMMB < MinRAMMB {
		reasons = append(reasons, i18n.T("probe.ram.low", machine.RAMMB, MinRAMMB))
		fixes = append(fixes, i18n.T("probe.ram.low.fix"))
	}

	if !machine.Sudo {
		reasons = append(reasons, i18n.T("probe.sudo.missing"))
		fixes = append(fixes, i18n.T("probe.sudo.missing.fix"))
	}

	return reasons, fixes
}

func managed(machine Machine) Verdict {
	upToDate := machine.Current == "" || machine.AgentVersion == machine.Current
	verdict := Verdict{Level: LevelReady, Kind: KindManaged, UpToDate: &upToDate, Fixes: []string{}}

	if upToDate {
		verdict.Reasons = []string{i18n.T("probe.managed.upToDate", machine.AgentVersion)}

		return verdict
	}

	verdict.Level = LevelWarning
	verdict.Reasons = []string{i18n.T("probe.managed.behind", machine.AgentVersion, machine.Current)}
	verdict.Fixes = []string{i18n.T("probe.managed.behind.fix")}

	return verdict
}

func occupants(machine Machine) (reasons, fixes []string) {
	reasons, fixes = []string{}, []string{}

	if machine.Docker {
		reasons = append(reasons, i18n.T("probe.docker.present"))
		fixes = append(fixes, i18n.T("probe.docker.present.fix"))
	}

	if machine.Panel != "" {
		reasons = append(reasons, i18n.T("probe.panel.present", machine.Panel))
		fixes = append(fixes, i18n.T("probe.panel.present.fix"))
	}

	web := false
	for _, port := range machine.Ports {
		if port.Port != 80 && port.Port != 443 {
			continue
		}

		web = true
		if port.Process == "" {
			reasons = append(reasons, i18n.T("probe.port.taken", port.Port))
			continue
		}

		reasons = append(reasons, i18n.T("probe.port.taken.by", port.Port, port.Process))
	}

	if web {
		fixes = append(fixes, i18n.T("probe.ports.web.fix"))
	}

	if len(machine.Users) > 0 {
		reasons = append(reasons, i18n.T("probe.users.present", strings.Join(machine.Users, ", ")))
		fixes = append(fixes, i18n.T("probe.users.present.fix"))
	}

	return reasons, fixes
}

func label(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "inconnue"
	}

	return trimmed
}

func contains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}

	return false
}
