package query_test

import (
	"slices"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules/db/query"
	"pupitre.studio/agent/internal/modules/modtest"
)

func TestTheClientRunsAsDevWithTheStatementOnStdin(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("psql", " count \n-------\n     3\n(1 row)\n")

	result := query.Run(modtest.NewSysContext(fake), query.Client{
		Argv:  []string{"psql", "--dbname=shop"},
		Stdin: "SELECT count(*) FROM orders",
		Env:   []string{"PGPASSWORD=hunter2"},
	})

	if result.Failed || result.Truncated || !strings.Contains(result.Output, "(1 row)") {
		t.Fatalf("result: %+v", result)
	}

	call := fake.Calls[len(fake.Calls)-1]
	if call.User != "dev" || call.Dir != "/home/dev" {
		t.Fatalf("ran as %q in %q", call.User, call.Dir)
	}

	if string(call.Stdin) != "SELECT count(*) FROM orders" {
		t.Fatalf("stdin: %q", call.Stdin)
	}

	if !slices.Contains(call.Env, "PGPASSWORD=hunter2") || !slices.Contains(call.Env, "HOME=/home/dev") {
		t.Fatalf("env: %v", call.Env)
	}

	if call.Timeout <= query.Timeout() || call.Timeout >= time.Minute {
		t.Fatalf("the client outlives the engine's timeout and stays under an MCP client's minute: %v", call.Timeout)
	}
}

func TestARefusedStatementComesBackWithTheEngineSentence(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailProgram("psql", `ERROR:  relation "ordres" does not exist`)

	result := query.Run(modtest.NewSysContext(fake), query.Client{Argv: []string{"psql"}, Stdin: "SELECT * FROM ordres"})

	if !result.Failed || !strings.Contains(result.Output, `relation "ordres" does not exist`) {
		t.Fatalf("result: %+v", result)
	}
}

func TestAnOutputPastTheCapIsCutAndSaidSo(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("mongosh", strings.Repeat("é", contract.DbQuery.OutputMaxBytes))

	result := query.Run(modtest.NewSysContext(fake), query.Client{Argv: []string{"mongosh"}})

	if !result.Truncated || len(result.Output) > contract.DbQuery.OutputMaxBytes {
		t.Fatalf("truncated %v, %d bytes", result.Truncated, len(result.Output))
	}

	if !strings.HasPrefix(result.Output, "é") || strings.ContainsRune(result.Output, '�') {
		t.Fatalf("the cut must not split a character")
	}
}

func TestAccessIsOnUntilTheOwnerTurnsItOff(t *testing.T) {
	field := query.AccessField()

	if field.Key != query.AccessKey || field.Kind != contract.FieldBoolean || field.Default != true {
		t.Fatalf("field: %+v", field)
	}
}
