package redis

import (
	"errors"
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
)

func installed() *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Packages[pkg] = "5:7.0.15-1build2"

	return fake
}

func TestAQueryRunsAsDevWithThePasswordInTheEnvironment(t *testing.T) {
	fake := installed()
	fake.Answer("redis-cli", "\"Ada\"\n")

	result, err := Query(newContext(t, fake, nil), "3", "GET user:1")
	if err != nil || result.Failed || result.Output != "\"Ada\"\n" {
		t.Fatalf("result %+v, %v", result, err)
	}

	call := fake.Calls[len(fake.Calls)-1]
	line := strings.Join(call.Argv, " ")

	if line != "redis-cli --no-auth-warning --no-raw -h 127.0.0.1 -p 6379 -n 3" {
		t.Fatalf("argv: %q", line)
	}

	if call.User != "dev" || string(call.Stdin) != "GET user:1" || !slices.Contains(call.Env, "REDISCLI_AUTH="+password) {
		t.Fatalf("user %q, stdin %q, env %v", call.User, call.Stdin, call.Env)
	}
}

func TestAQueryWithoutADatabaseReadsTheFirst(t *testing.T) {
	fake := installed()

	if _, err := Query(newContext(t, fake, nil), "", "DBSIZE"); err != nil {
		t.Fatal(err)
	}

	if line := strings.Join(fake.Calls[len(fake.Calls)-1].Argv, " "); strings.Contains(line, " -n ") {
		t.Fatalf("argv: %q", line)
	}
}

func TestADatabaseIsAnIndexRedisHolds(t *testing.T) {
	for _, name := range []string{"shop", "16", "-1", "007x"} {
		_, err := Query(newContext(t, installed(), nil), name, "DBSIZE")

		var refusal *protocol.Error
		if !errors.As(err, &refusal) || refusal.Code != contract.ErrorBadRequest || refusal.Fix == "" {
			t.Errorf("%q: %v", name, err)
		}
	}
}

func TestAnErrorReplyFailsTheQuery(t *testing.T) {
	fake := installed()
	fake.Answer("redis-cli", "OK\n(error) WRONGTYPE Operation against a key holding the wrong kind of value\n")

	result, err := Query(newContext(t, fake, nil), "", "SET k v\nLPUSH k x")
	if err != nil || !result.Failed || !strings.Contains(result.Output, "WRONGTYPE") {
		t.Fatalf("result %+v, %v", result, err)
	}
}

func TestAQueryOnAMissingRedisIsRefused(t *testing.T) {
	if _, err := Query(newContext(t, modtest.NewFakeSys(), nil), "", "PING"); err == nil {
		t.Fatal("a server without Redis must refuse")
	}
}
