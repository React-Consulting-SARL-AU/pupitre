package onepassword

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys/env"
)

const (
	token    = "s3cret-de-test"
	injected = "DATABASE_URL=postgres://dev:motdepasse@127.0.0.1/flymate\nAUTH_SECRET=au-secret\n"

	projects = `web|flymate/apps/web|-|bun|web.localhost|3000|app|bun run dev
api|flymate/apps/api|-|bun|api.localhost|3001|-|bun run api
`
)

const (
	home    = registry.ProjectsDir + "/flymate/apps/web"
	root    = registry.ProjectsDir + "/flymate"
	target  = home + "/.env.local"
	example = "DATABASE_URL=\nAUTH_SECRET=\n"
)

func newContext(t *testing.T, fake *modtest.FakeSys, secrets modtest.Secrets) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Secrets: secrets})
}

func machine() *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Packages[pkg] = "2.32.0"
	fake.Files[registry.DefaultConf] = []byte(projects)
	fake.Files[home+"/"+templateName] = []byte("DATABASE_URL={{ op://{{OP_VAULT}}/{{OP_ITEM}}/url }}\n")
	fake.Files[root+"/"+configName] = []byte(`{"vault":"Dev","item":"flymate"}`)
	fake.Answer("op inject", strings.TrimSuffix(injected, "\n"))

	return fake
}

func configuredMachine() *modtest.FakeSys {
	fake := machine()
	fake.Files[keyringPath] = []byte("keyring")
	fake.Files[sourcePath] = []byte(sourceLine())
	fake.Files[env.Path] = []byte(envKey + "=" + token + "\n")
	fake.Files[shell.UserEnvPath] = []byte("export " + envKey + "='" + token + "'\n")
	fake.Files[shell.EnvPath] = []byte("# >>> pupitre pupitre-env >>>\n[[ -r \"$HOME/.config/pupitre/env\" ]] && source \"$HOME/.config/pupitre/env\"\n# <<< pupitre pupitre-env <<<\n")

	return fake
}

// `op whoami` in a terminal runs as dev and reads OP_SERVICE_ACCOUNT_TOKEN from its own shell, never from root's file.
func TestTheTokenReachesTheDevShellAndLeavesWithTheModule(t *testing.T) {
	fake := machine()
	ctx := newContext(t, fake, modtest.Secrets{"service_account_token": token})

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	if got := string(fake.Files[shell.UserEnvPath]); got != "export "+envKey+"='"+token+"'\n" {
		t.Fatalf("dev env = %q", got)
	}

	if fake.Modes[shell.UserEnvPath] != 0o600 || fake.Owners[shell.UserEnvPath] != "dev:dev" {
		t.Fatalf("dev env: mode %o, owner %s", fake.Modes[shell.UserEnvPath], fake.Owners[shell.UserEnvPath])
	}

	if err := (Module{}).Uninstall(newContext(t, fake, modtest.Secrets{})); err != nil {
		t.Fatal(err)
	}

	if _, kept := fake.Files[shell.UserEnvPath]; kept || fake.EnvValue(envKey) != "" {
		t.Fatalf("the token survives: %q / %q", fake.Files[shell.UserEnvPath], fake.EnvValue(envKey))
	}
}

func TestInstallAndConfigureAreIdempotent(t *testing.T) {
	fake := configuredMachine()
	ctx := newContext(t, fake, modtest.Secrets{"service_account_token": token})

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	for _, event := range ctx.Events() {
		if event.Step != "verify-service-account" && event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine: %v", fake.Mutations)
	}
}

// The engine refuses a configuration before the first step, so the module never
// sees a missing secret. What this module owes is the declaration it is refused on.
func TestTheSecretIsRequiredByTheContract(t *testing.T) {
	held := func(string, string) []string { return nil }

	for _, field := range manifest().Fields {
		if field.Key != "service_account_token" {
			continue
		}

		problem := contract.ValidateField(ID, field, nil, held)
		if problem == nil || problem.Code != contract.ProblemRequired {
			t.Fatalf("problem = %+v", problem)
		}

		if problem.Message == "" {
			t.Fatal("a refusal says what is wrong")
		}

		return
	}

	t.Fatalf("the manifest declares no service_account_token field")
}

func TestSecretNeverLeaks(t *testing.T) {
	fake := machine()
	ctx := newContext(t, fake, modtest.Secrets{"service_account_token": token})

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	if _, err := Env(ctx, "web", false); err != nil {
		t.Fatal(err)
	}

	for _, line := range ctx.Output() {
		if strings.Contains(line, token) || strings.Contains(line, "motdepasse") {
			t.Fatalf("secret in output: %s", line)
		}
	}

	for _, call := range fake.Calls {
		if strings.Contains(strings.Join(call.Argv, " "), token) {
			t.Fatalf("the token travels in the environment, never in argv: %v", call.Argv)
		}
	}
}

func TestFailedStepReportsReplay(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailPackage(pkg, "E: Unable to locate package 1password-cli")
	ctx := newContext(t, fake, modtest.Secrets{"service_account_token": token})

	if err := (Module{}).Install(ctx); err == nil {
		t.Fatal("expected install to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected event: %+v", last)
	}
}

func TestEnvInjectsTheTemplateAndReturnsKeysOnly(t *testing.T) {
	fake := machine()
	ctx := newContext(t, fake, modtest.Secrets{"service_account_token": token})

	result, err := Env(ctx, "web", false)
	if err != nil {
		t.Fatal(err)
	}

	if result.Path != target || !result.Written {
		t.Fatalf("unexpected result: %+v", result)
	}

	if strings.Join(result.Keys, ",") != "DATABASE_URL,AUTH_SECRET" {
		t.Fatalf("the keys of the file, in its order: %v", result.Keys)
	}

	for _, key := range result.Keys {
		if strings.Contains(key, "=") || strings.Contains(key, "motdepasse") {
			t.Fatalf("a key is a name, never a value: %q", key)
		}
	}

	if string(fake.Files[target]) != injected {
		t.Fatalf("unexpected file:\n%s", fake.Files[target])
	}

	if fake.Modes[target] != 0o600 || fake.Owners[target] != "dev:dev" {
		t.Fatalf(".env.local must be 0600 and owned by dev: %o %s", fake.Modes[target], fake.Owners[target])
	}

	var sent string
	for _, call := range fake.Calls {
		if len(call.Argv) > 1 && call.Argv[0] == program {
			sent = string(call.Stdin)
		}
	}
	if !strings.Contains(sent, "op://Dev/flymate/url") {
		t.Fatalf("the placeholders of the template must be substituted before op sees it: %q", sent)
	}
}

// An existing file is the project's own: regenerating it is asked for, never guessed.
func TestEnvKeepsAnExistingFileUnlessForced(t *testing.T) {
	fake := machine()
	fake.Files[target] = []byte("DATABASE_URL=deja-la\n")
	ctx := newContext(t, fake, modtest.Secrets{"service_account_token": token})

	result, err := Env(ctx, "web", false)
	if err != nil {
		t.Fatal(err)
	}

	if result.Written || string(fake.Files[target]) != "DATABASE_URL=deja-la\n" {
		t.Fatalf("nothing must be rewritten: %+v", result)
	}

	forced, err := Env(ctx, "web", true)
	if err != nil {
		t.Fatal(err)
	}

	if !forced.Written || string(fake.Files[target]) != injected {
		t.Fatalf("force must regenerate: %+v", forced)
	}
}

func TestEnvFallsBackOnTheVersionedExampleWithoutASecretManager(t *testing.T) {
	fake := machine()
	delete(fake.Packages, pkg)
	fake.Files[home+"/"+exampleName] = []byte(example)
	ctx := newContext(t, fake, nil)

	result, err := Env(ctx, "web", false)
	if err != nil {
		t.Fatal(err)
	}

	if !result.Written || string(fake.Files[target]) != example {
		t.Fatalf("the example is the fallback: %+v", result)
	}
}

func TestEnvSaysWhatIsMissingWhenTheRepositoryVersionsNothing(t *testing.T) {
	fake := machine()
	delete(fake.Files, home+"/"+templateName)
	ctx := newContext(t, fake, modtest.Secrets{"service_account_token": token})

	_, err := Env(ctx, "web", false)

	failure, isProtocol := err.(*protocol.Error)
	if !isProtocol || failure.Code != contract.ErrorBadRequest || failure.Fix == "" {
		t.Fatalf("want a bad_request that says how to fix it, got %#v", err)
	}
}

func TestEnvRefusesAnUnknownProject(t *testing.T) {
	fake := machine()
	ctx := newContext(t, fake, nil)

	_, err := Env(ctx, "ghost", false)

	failure, isProtocol := err.(*protocol.Error)
	if !isProtocol || failure.Code != contract.ErrorProjectNotFound {
		t.Fatalf("want project_not_found, got %#v", err)
	}
}

var _ modules.Module = Module{}
