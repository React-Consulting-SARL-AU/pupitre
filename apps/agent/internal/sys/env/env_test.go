package env_test

import (
	"reflect"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sys/env"
)

const password = "s3cret-de-test"

func TestSetWritesRootOnlyAndIsIdempotent(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := modtest.NewContext(t, fake, modtest.Options{Secrets: modtest.Secrets{"password": password}})

	changed, err := env.Set(ctx, "REDIS_PASSWORD", password)
	if err != nil || !changed {
		t.Fatalf("Set = %v, %v", changed, err)
	}

	if fake.Modes[env.Path] != 0o600 || fake.Modes["/etc/pupitre"] != 0o700 {
		t.Fatalf("modes: file %o, dir %o", fake.Modes[env.Path], fake.Modes["/etc/pupitre"])
	}

	if fake.EnvValue("REDIS_PASSWORD") != password {
		t.Fatalf("env file = %q", fake.Files[env.Path])
	}

	mutations := len(fake.Mutations)
	changed, err = env.Set(ctx, "REDIS_PASSWORD", password)
	if err != nil || changed || len(fake.Mutations) != mutations {
		t.Fatalf("same value must not write: %v, %v, %v", changed, err, fake.Mutations[mutations:])
	}

	if _, err := env.Set(ctx, "MYSQL_APP_PASSWORD", "other"); err != nil {
		t.Fatal(err)
	}

	keys, err := env.Keys(ctx)
	if err != nil || !reflect.DeepEqual(keys, []string{"MYSQL_APP_PASSWORD", "REDIS_PASSWORD"}) {
		t.Fatalf("Keys = %v, %v", keys, err)
	}

	value, ok, err := env.Get(ctx, "REDIS_PASSWORD")
	if err != nil || !ok || value != password {
		t.Fatalf("Get = %q, %v, %v", value, ok, err)
	}

	for _, line := range ctx.Output() {
		if strings.Contains(line, password) || strings.Contains(line, "other") {
			t.Fatalf("value leaked into the journal: %s", line)
		}
	}
}

func TestUnsetAndValidation(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[env.Path] = []byte("A=1\nB=2\n")
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	removed, err := env.Unset(ctx, "A")
	if err != nil || !removed || string(fake.Files[env.Path]) != "B=2\n" {
		t.Fatalf("Unset = %v, %v, %q", removed, err, fake.Files[env.Path])
	}

	removed, err = env.Unset(ctx, "A")
	if err != nil || removed {
		t.Fatalf("second Unset = %v, %v", removed, err)
	}

	if _, err := env.Set(ctx, "lower", "x"); err == nil {
		t.Fatal("lowercase key accepted")
	}

	if _, err := env.Set(ctx, "MULTI", "a\nb"); err == nil {
		t.Fatal("multi-line value accepted")
	}
}
