package shell_test

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/shell"
)

const secret = "napi_s3cret'quoted"

func TestSetUserEnvIsReadByDevAloneAndSourcedByTheShell(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	changed, err := shell.SetUserEnv(ctx, "NEON_API_KEY", secret)
	if err != nil || !changed {
		t.Fatalf("SetUserEnv = %v, %v", changed, err)
	}

	if fake.Modes[shell.UserEnvPath] != 0o600 || fake.Owners[shell.UserEnvPath] != "dev:dev" {
		t.Fatalf("file: mode %o, owner %s", fake.Modes[shell.UserEnvPath], fake.Owners[shell.UserEnvPath])
	}

	if fake.Owners[shell.UserEnvDir] != "dev:dev" {
		t.Fatalf("dir owner = %s", fake.Owners[shell.UserEnvDir])
	}

	if got := string(fake.Files[shell.UserEnvPath]); got != "export NEON_API_KEY='napi_s3cret'\\''quoted'\n" {
		t.Fatalf("env file = %q", got)
	}

	if !shell.HasBlock(ctx, "pupitre-env") || !strings.Contains(string(fake.Files[shell.EnvPath]), `source "$HOME/.config/pupitre/env"`) {
		t.Fatalf(".zshenv = %q", fake.Files[shell.EnvPath])
	}

	mutations := len(fake.Mutations)
	changed, err = shell.SetUserEnv(ctx, "NEON_API_KEY", secret)
	if err != nil || changed || len(fake.Mutations) != mutations {
		t.Fatalf("same value must not write: %v, %v, %v", changed, err, fake.Mutations[mutations:])
	}

	for _, line := range ctx.Output() {
		if strings.Contains(line, secret) {
			t.Fatalf("value leaked into the journal: %s", line)
		}
	}
}

func TestUnsetUserEnvLeavesTheOtherKeysAndCleansUpAfterTheLast(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	for key, value := range map[string]string{"NEON_API_KEY": "a", "OP_SERVICE_ACCOUNT_TOKEN": "b"} {
		if _, err := shell.SetUserEnv(ctx, key, value); err != nil {
			t.Fatal(err)
		}
	}

	removed, err := shell.UnsetUserEnv(ctx, "NEON_API_KEY")
	if err != nil || !removed || string(fake.Files[shell.UserEnvPath]) != "export OP_SERVICE_ACCOUNT_TOKEN='b'\n" {
		t.Fatalf("Unset = %v, %v, %q", removed, err, fake.Files[shell.UserEnvPath])
	}

	removed, err = shell.UnsetUserEnv(ctx, "NEON_API_KEY")
	if err != nil || removed {
		t.Fatalf("a second unset changes nothing: %v, %v", removed, err)
	}

	if _, err := shell.UnsetUserEnv(ctx, "OP_SERVICE_ACCOUNT_TOKEN"); err != nil {
		t.Fatal(err)
	}

	if _, left := fake.Files[shell.UserEnvPath]; left || shell.HasBlock(ctx, "pupitre-env") {
		t.Fatalf("the last key takes the file and the hook with it: %q / %q", fake.Files[shell.UserEnvPath], fake.Files[shell.EnvPath])
	}
}
