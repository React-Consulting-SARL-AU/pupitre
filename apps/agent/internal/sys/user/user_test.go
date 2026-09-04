package user_test

import (
	"reflect"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sys/user"
)

func TestRunAsDevUsesArgvAndAFullEnvironment(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Replies["node"] = "v22.12.0\n"
	ctx := modtest.NewContext(t, fake, modtest.Options{Secrets: modtest.Secrets{"token": "s3cret-de-test"}})

	out, err := user.Run(ctx, "dev", "node", "-v")
	if err != nil || strings.TrimSpace(out) != "v22.12.0" {
		t.Fatalf("Run = %q, %v", out, err)
	}

	call := fake.Calls[0]
	if call.User != "dev" || call.Dir != "/home/dev" || !reflect.DeepEqual(call.Argv, []string{"node", "-v"}) {
		t.Fatalf("call = %+v", call)
	}

	env := strings.Join(call.Env, "\n")
	for _, want := range []string{"HOME=/home/dev", "USER=dev", "MISE_YES=1", "COREPACK_ENABLE_DOWNLOAD_PROMPT=0", "PATH=/home/dev/.local/bin:/home/dev/.local/share/mise/shims:/home/dev/.bun/bin:"} {
		if !strings.Contains(env, want) {
			t.Errorf("env lacks %s:\n%s", want, env)
		}
	}

	if _, err := user.Run(ctx, "dev", "gh", "auth", "login", "--with-token", "s3cret-de-test"); err != nil {
		t.Fatal(err)
	}

	output := strings.Join(ctx.Output(), "\n")
	if strings.Contains(output, "s3cret-de-test") || !strings.Contains(output, "(dev) gh auth login --with-token [secret]") {
		t.Fatalf("journal must redact the secret:\n%s", output)
	}
}

func TestExistsCreateAndHome(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	if user.Exists(ctx, "dev") || !user.Exists(ctx, "root") {
		t.Fatal("Exists answers wrong")
	}

	if err := user.Create(ctx, "dev", "/bin/zsh"); err != nil {
		t.Fatal(err)
	}

	if !reflect.DeepEqual(fake.Calls[len(fake.Calls)-1].Argv, []string{"useradd", "--create-home", "--user-group", "--shell", "/bin/zsh", "dev"}) {
		t.Fatalf("argv = %v", fake.Calls[len(fake.Calls)-1].Argv)
	}

	if !user.Exists(ctx, "dev") || user.Home("dev") != "/home/dev" || user.Home("root") != "/root" {
		t.Fatal("user not created or home wrong")
	}

	if err := user.Create(ctx, "dev", ""); err == nil {
		t.Fatal("creating an existing user must fail")
	}
}
