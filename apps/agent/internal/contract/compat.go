package contract

import (
	"regexp"
	"strconv"
	"strings"
)

// Generation is a protocol generation, as packages/shared/src/compat writes it and schema.json carries it here.
type Generation struct {
	Protocol int    `json:"protocol"`
	App      string `json:"app"`
	Agent    string `json:"agent"`
}

type Side string

const (
	SideApp   Side = "app"
	SideAgent Side = "agent"
)

// Verdict is unknown for a dev build, which has no semver version and so cannot be placed in the sheet.
type Verdict string

const (
	VerdictOK          Verdict = "ok"
	VerdictAgentTooOld Verdict = "agent_too_old"
	VerdictAppTooOld   Verdict = "app_too_old"
	VerdictUnknown     Verdict = "unknown"
)

var coreRe = regexp.MustCompile(`^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+].*)?$`)

func (g Generation) side(side Side) string {
	if side == SideApp {
		return g.App
	}

	return g.Agent
}

func generationIndex(side Side, version string) int {
	core, ok := coreOf(version)
	if !ok {
		return -1
	}

	found := -1

	for index, generation := range spec.Compatibility {
		if compareCores(core, generation.side(side)) >= 0 {
			found = index
		}
	}

	return found
}

func GenerationOf(side Side, version string) (Generation, bool) {
	index := generationIndex(side, version)
	if index < 0 {
		return Generation{}, false
	}

	return spec.Compatibility[index], true
}

// AppFloor returns the oldest app version this agent version accepts to serve.
func AppFloor(agentVersion string) string {
	generation, ok := GenerationOf(SideAgent, agentVersion)
	if !ok {
		return ""
	}

	return generation.App
}

// AgentFloor returns the oldest agent version this app version knows how to drive.
func AgentFloor(appVersion string) string {
	generation, ok := GenerationOf(SideApp, appVersion)
	if !ok {
		return ""
	}

	return generation.Agent
}

func Compatibility(appVersion, agentVersion string) Verdict {
	app := generationIndex(SideApp, appVersion)
	agent := generationIndex(SideAgent, agentVersion)

	if !(semverish(appVersion) && semverish(agentVersion)) {
		return VerdictUnknown
	}

	switch {
	case app < 0:
		return VerdictAppTooOld
	case agent < 0:
		return VerdictAgentTooOld
	case app == agent:
		return VerdictOK
	case app > agent:
		return VerdictAgentTooOld
	default:
		return VerdictAppTooOld
	}
}

func semverish(version string) bool {
	_, ok := coreOf(version)

	return ok
}

// coreOf places a pre-release in the line it announces: 0.2.0-beta.1 is generation 0.2.0, not the one before it.
func coreOf(version string) ([3]int, bool) {
	match := coreRe.FindStringSubmatch(version)
	if match == nil {
		return [3]int{}, false
	}

	var core [3]int

	for index := range core {
		number, err := strconv.Atoi(match[index+1])
		if err != nil {
			return [3]int{}, false
		}

		core[index] = number
	}

	return core, true
}

func compareCores(core [3]int, version string) int {
	other, ok := coreOf(strings.TrimSpace(version))
	if !ok {
		return 1
	}

	for index, part := range core {
		if part != other[index] {
			if part < other[index] {
				return -1
			}

			return 1
		}
	}

	return 0
}
