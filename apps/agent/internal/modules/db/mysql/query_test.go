package mysql

import (
	"slices"
	"strings"
	"testing"
)

func TestAQueryRunsAsDevWithTheAppAccountOnTheLoopback(t *testing.T) {
	fake := installedSys(t)
	fake.Answer("--database=shop", "+---+\n| 1 |\n+---+\n")

	result, err := Query(newContext(t, fake, values), "shop", "SELECT 1")
	if err != nil || result.Failed || !strings.Contains(result.Output, "| 1 |") {
		t.Fatalf("result %+v, %v", result, err)
	}

	call := fake.Calls[len(fake.Calls)-1]
	line := strings.Join(call.Argv, " ")

	for _, want := range []string{"mysql ", "--no-defaults", "--protocol=tcp", "--host=127.0.0.1", "--user=root", "--table", "--database=shop"} {
		if !strings.Contains(line, want) {
			t.Errorf("%q missing from %q", want, line)
		}
	}

	if call.User != "dev" || string(call.Stdin) != "SELECT 1" || strings.Contains(line, appPassword) {
		t.Fatalf("user %q, stdin %q, argv %q", call.User, call.Stdin, line)
	}

	if !slices.Contains(call.Env, "MYSQL_PWD="+appPassword) {
		t.Fatalf("env: %v", call.Env)
	}
}
