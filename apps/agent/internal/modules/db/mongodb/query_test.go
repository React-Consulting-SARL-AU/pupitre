package mongodb

import (
	"slices"
	"strings"
	"testing"
)

func TestAQuerySignsInFromTheEnvironmentNeverFromArgv(t *testing.T) {
	fake := installedSys(t)
	fake.Answer("mongodb://127.0.0.1:27017/shop", "[ { name: 'Ada' } ]\n")

	result, err := Query(newContext(t, fake), "shop", "db.users.find().toArray()")
	if err != nil || result.Failed || !strings.Contains(result.Output, "Ada") {
		t.Fatalf("result %+v, %v", result, err)
	}

	call := fake.Calls[len(fake.Calls)-1]
	line := strings.Join(call.Argv, " ")

	if call.User != "dev" || strings.Contains(line, appPassword) {
		t.Fatalf("user %q, argv %q", call.User, line)
	}

	evals := call.Argv[len(call.Argv)-4:]
	signIn := `db.getSiblingDB("admin").auth("app", process.env.` + queryPasswordKey + `);`

	if !slices.Equal(evals, []string{"--eval", signIn, "--eval", "db.users.find().toArray()"}) {
		t.Fatalf("the statement keeps an --eval of its own, so its errors name its own lines: %q", evals)
	}

	if !slices.Contains(call.Env, queryPasswordKey+"="+appPassword) {
		t.Fatalf("env: %v", call.Env)
	}
}
