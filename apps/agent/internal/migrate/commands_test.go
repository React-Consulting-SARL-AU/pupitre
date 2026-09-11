package migrate_test

import (
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/migrate"
	"pupitre.studio/agent/internal/protocol"
)

func TestCommandIsPartOfTheContract(t *testing.T) {
	server := protocol.NewServer(protocol.Options{AgentVersion: "test"})
	migrate.RegisterCommands(server, migrate.New(migrate.Options{Sys: newSys()}))

	result, err := server.Call("agent.migrate", map[string]any{}, nil)
	if err != nil {
		t.Fatalf("agent.migrate refused: %v", err)
	}

	answer, ok := result.(migrate.Result)
	if !ok {
		t.Fatalf("result = %T, want migrate.Result", result)
	}

	if answer.State != contract.ConfigCurrent {
		t.Fatalf("state = %q, want current", answer.State)
	}
}
