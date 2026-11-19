package postgres

import (
	"slices"
	"strings"
	"testing"
)

func TestAQueryRunsAsDevWithTheAppRoleAndAServerSideTimeout(t *testing.T) {
	fake := installedSys(t)
	fake.Answer("--dbname=shop", "(1 row)\n")

	result, err := Query(newContext(t, fake), "shop", "SELECT 1")
	if err != nil || result.Failed || result.Output != "(1 row)\n" {
		t.Fatalf("result %+v, %v", result, err)
	}

	call := fake.Calls[len(fake.Calls)-1]
	line := strings.Join(call.Argv, " ")

	for _, want := range []string{"psql ", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--username=app", "--host=127.0.0.1", "--dbname=shop"} {
		if !strings.Contains(line, want) {
			t.Errorf("%q missing from %q", want, line)
		}
	}

	if call.User != "dev" || string(call.Stdin) != "SELECT 1" || strings.Contains(line, appPassword) {
		t.Fatalf("user %q, stdin %q, argv %q", call.User, call.Stdin, line)
	}

	if !slices.Contains(call.Env, "PGPASSWORD="+appPassword) || !slices.Contains(call.Env, "PGOPTIONS=-c statement_timeout=45000") {
		t.Fatalf("env: %v", call.Env)
	}
}

func TestAQueryOnAMissingClusterIsRefusedBeforeAnyClient(t *testing.T) {
	fake := newFakeSys()

	if _, err := Query(newContext(t, fake), "", "SELECT 1"); err == nil {
		t.Fatal("a server without PostgreSQL must refuse")
	}

	for _, call := range fake.Calls {
		if call.Argv[0] == "psql" {
			t.Fatalf("psql ran: %v", call.Argv)
		}
	}
}
