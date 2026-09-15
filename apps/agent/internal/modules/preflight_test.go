package modules_test

import (
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
)

type listeningDemo struct {
	modtest.Passing
}

func (m listeningDemo) Preflight(ctx *modules.Context) []contract.FieldProblem {
	return modules.Problems(modules.PortTaken(ctx, "port"))
}

// /proc/net/tcp with one socket in TCP_LISTEN on 3306 (0x0CEA).
const listeningOn3306 = "  sl  local_address rem_address   st\n   0: 00000000:0CEA 00000000:0000 0A\n"

// The installed module is what listens on its own port: changing its password
// must not read as a port another program holds.
func TestCheckKeepsThePortTheInstalledModuleHolds(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files["/proc/net/tcp"] = []byte(listeningOn3306)

	registry := demoRegistry(
		modtest.Passing{ID: "core.system"},
		listeningDemo{modtest.Passing{ID: "tool.demo", Requires: []string{"core.system"}, Unit: "demo", EnvKey: "DEMO_PASSWORD"}},
	)
	engine := newEngine(t, fake, registry, entitled(contract.EntitlementDev))

	if _, err := engine.Install(modules.Request{
		Modules: []string{"tool.demo"},
		Config:  map[string]map[string]any{"tool.demo": {"port": 3306}},
		Secrets: map[string]map[string]string{"tool.demo": {"password": secret}},
		Persist: true,
	}, nil); err != nil {
		t.Fatal(err)
	}

	answer, err := engine.Check(modules.Request{
		Modules: []string{"tool.demo"},
		Config:  map[string]map[string]any{"tool.demo": {"port": 3306}},
		Secrets: map[string]map[string]string{"tool.demo": {"password": "another"}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(answer.Problems) != 0 {
		t.Fatalf("the module's own port was refused: %+v", answer.Problems)
	}

	answer, err = engine.Check(modules.Request{
		Modules: []string{"tool.demo"},
		Config:  map[string]map[string]any{"tool.demo": {"port": 3306}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(answer.Problems) != 0 {
		t.Fatalf("an unchanged request was refused: %+v", answer.Problems)
	}
}

// A port some other program holds is still refused, installed module or not.
func TestCheckStillRefusesAPortAnotherProgramHolds(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files["/proc/net/tcp"] = []byte(listeningOn3306)

	registry := demoRegistry(
		modtest.Passing{ID: "core.system"},
		listeningDemo{modtest.Passing{ID: "tool.demo", Requires: []string{"core.system"}, Unit: "demo", EnvKey: "DEMO_PASSWORD"}},
	)
	engine := newEngine(t, fake, registry, entitled(contract.EntitlementDev))

	answer, err := engine.Check(modules.Request{
		Modules: []string{"tool.demo"},
		Config:  map[string]map[string]any{"tool.demo": {"port": 3306}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(answer.Problems) != 1 || answer.Problems[0].Field != "port" {
		t.Fatalf("problems = %+v", answer.Problems)
	}

	if _, err := engine.Install(modules.Request{
		Modules: []string{"tool.demo"},
		Config:  map[string]map[string]any{"tool.demo": {"port": 8080}},
		Secrets: map[string]map[string]string{"tool.demo": {"password": secret}},
		Persist: true,
	}, nil); err != nil {
		t.Fatal(err)
	}

	answer, err = engine.Check(modules.Request{
		Modules: []string{"tool.demo"},
		Config:  map[string]map[string]any{"tool.demo": {"port": 3306}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(answer.Problems) != 1 || answer.Problems[0].Field != "port" {
		t.Fatalf("moving onto a stranger's port must be refused, got %+v", answer.Problems)
	}
}
