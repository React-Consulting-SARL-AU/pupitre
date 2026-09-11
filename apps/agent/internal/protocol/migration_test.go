package protocol

import (
	"encoding/json"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/i18n"
)

func serverAt(config contract.ConfigRevision) *Server {
	server := NewServer(Options{
		AgentVersion: testAgentVersion,
		Config:       func() contract.ConfigRevision { return config },
		Entitlement:  entitlement.Fixed(contract.EntitlementDev),
		Now:          fixedNow,
	})

	for _, cmd := range []string{"install", "snapshot", "agent.migrate"} {
		server.Register(cmd, func(_ *Context, _ json.RawMessage) (any, error) {
			return map[string]any{}, nil
		})
	}

	return server
}

func installParams() map[string]any {
	return map[string]any{"config": map[string]any{}, "modules": []string{"core.system"}, "secrets_stdin": true}
}

func TestAConfigurationThisBinaryCannotReadClosesTheCommandsThatWouldReadIt(t *testing.T) {
	i18n.Use("en")

	server := serverAt(contract.ConfigRevision{Expected: 4, Revision: 3, State: contract.ConfigPending})

	_, err := server.Call("install", installParams(), nil)
	if err == nil {
		t.Fatal("install ran on a configuration this binary does not read")
	}

	failure, ok := err.(*Error)
	if !ok || failure.Code != contract.ErrorMigrationRequired {
		t.Fatalf("error = %v, want migration_required", err)
	}

	if failure.Fix == "" {
		t.Fatal("the refusal says nothing about what to do next")
	}
}

func TestTheWaysOutStayOpen(t *testing.T) {
	server := serverAt(contract.ConfigRevision{Expected: 4, Revision: 3, State: contract.ConfigFailed})

	for _, cmd := range []string{"snapshot", "agent.migrate", "ping"} {
		if _, err := server.Call(cmd, map[string]any{}, nil); err != nil {
			t.Fatalf("%s refused: %v", cmd, err)
		}
	}
}

func TestAConfigurationAtTheExpectedRevisionGatesNothing(t *testing.T) {
	server := serverAt(contract.ConfigRevision{Expected: 4, Revision: 4, State: contract.ConfigCurrent})

	if _, err := server.Call("install", installParams(), nil); err != nil {
		t.Fatalf("install refused: %v", err)
	}
}

func TestHelloCarriesTheRevisionTheMachineIsAt(t *testing.T) {
	server := serverAt(contract.ConfigRevision{Expected: 4, Revision: 3, State: contract.ConfigPending})

	result, err := server.Call("hello", map[string]any{"app_version": "0.1.0", "protocol": contract.ProtocolVersion}, nil)
	if err != nil {
		t.Fatalf("hello refused: %v", err)
	}

	answer, ok := result.(helloResult)
	if !ok {
		t.Fatalf("result = %T, want helloResult", result)
	}

	if answer.Config == nil || answer.Config.Revision != 3 || answer.Config.Expected != 4 {
		t.Fatalf("config = %+v, want revision 3 of 4", answer.Config)
	}
}

// An agent with no ledger to consult answers as it always did, and its commands
// are gated by the entitlement alone.
func TestAServerWithoutALedgerSaysNothingOfIt(t *testing.T) {
	server := NewServer(Options{AgentVersion: testAgentVersion, Entitlement: entitlement.Fixed(contract.EntitlementDev), Now: fixedNow})

	result, err := server.Call("hello", map[string]any{"app_version": "0.1.0", "protocol": contract.ProtocolVersion}, nil)
	if err != nil {
		t.Fatalf("hello refused: %v", err)
	}

	if answer := result.(helloResult); answer.Config != nil {
		t.Fatalf("config = %+v, want nothing", answer.Config)
	}
}
