package contract

import "testing"

func TestTheCompatibilitySheetIsOrdered(t *testing.T) {
	generations := spec.Compatibility
	if len(generations) == 0 {
		t.Fatal("schema.json carries no compatibility sheet")
	}

	last := generations[len(generations)-1]
	if last.Protocol != ProtocolVersion {
		t.Fatalf("last generation speaks protocol %d, the contract speaks %d", last.Protocol, ProtocolVersion)
	}

	for index, generation := range generations {
		if index == 0 {
			continue
		}

		previous := generations[index-1]
		if generation.Protocol <= previous.Protocol {
			t.Fatalf("generation %d does not follow %d", generation.Protocol, previous.Protocol)
		}
	}
}

func TestFloorsNameTheOtherSide(t *testing.T) {
	first := spec.Compatibility[0]

	if floor := AppFloor(first.Agent); floor != first.App {
		t.Fatalf("AppFloor(%q) = %q, want %q", first.Agent, floor, first.App)
	}

	if floor := AgentFloor(first.App); floor != first.Agent {
		t.Fatalf("AgentFloor(%q) = %q, want %q", first.App, floor, first.Agent)
	}

	if floor := AppFloor("v0.1.0-3-gabc1234"); floor != "" {
		t.Fatalf("AppFloor of a development build = %q, want nothing", floor)
	}
}

func TestCompatibilityNamesTheSideToUpdate(t *testing.T) {
	first := spec.Compatibility[0]

	cases := []struct {
		name  string
		app   string
		agent string
		want  Verdict
	}{
		{"same generation", first.App, first.Agent, VerdictOK},
		{"pre-release of the line", first.App + "-beta.1", first.Agent, VerdictOK},
		{"app older than the sheet", "0.0.1", first.Agent, VerdictAppTooOld},
		{"agent older than the sheet", first.App, "0.0.1", VerdictAgentTooOld},
		{"development build", "dev", first.Agent, VerdictUnknown},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := Compatibility(testCase.app, testCase.agent); got != testCase.want {
				t.Fatalf("Compatibility(%q, %q) = %q, want %q", testCase.app, testCase.agent, got, testCase.want)
			}
		})
	}
}
