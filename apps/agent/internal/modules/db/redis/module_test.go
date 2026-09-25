package redis

import (
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sys"
)

const password = "s3cret-de-test"

var values = modtest.Values{"port": DefaultPort, "persistence": true, "maxmemory_mb": 0}

func newContext(t *testing.T, fake *modtest.FakeSys, chosen modtest.Values) *modules.Context {
	t.Helper()

	fake.Replies["redis-cli"] = "PONG\n"

	return modtest.NewContext(t, fake, modtest.Options{
		Manifest: manifest(),
		Values:   chosen,
		Secrets:  modtest.Secrets{"password": password},
	})
}

func run(t *testing.T, ctx *modules.Context) {
	t.Helper()

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}
}

func statuses(ctx *modules.Context) map[string]contract.StepStatus {
	result := map[string]contract.StepStatus{}

	for _, event := range ctx.Events() {
		result[event.Step] = event.Status
	}

	return result
}

func TestConfigureBindsLocallyAndRequiresThePassword(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, values)

	run(t, ctx)

	config := string(fake.Files[dropIn])

	for _, want := range []string{"bind 127.0.0.1 ::1", "port 6379", `requirepass "` + password + `"`, "appendonly yes"} {
		if !strings.Contains(config, want) {
			t.Errorf("configuration lacks %q:\n%s", want, config)
		}
	}

	if !strings.Contains(string(fake.Files[confPath]), "include "+dropIn) {
		t.Fatalf("redis.conf does not include ours: %q", fake.Files[confPath])
	}

	status, err := (Module{}).Status(ctx)
	if err != nil || status.Port != DefaultPort || status.Credentials["Password"] != passwordKey {
		t.Fatalf("status = %+v, %v", status, err)
	}

	if err := contract.ValidateValue("ServiceStatusResult", status.Service(manifest())); err != nil {
		t.Fatal(err)
	}
}

func TestChosenPortPersistenceAndMemoryReachTheConfiguration(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, modtest.Values{"port": 6380, "persistence": false, "maxmemory_mb": 512})

	run(t, ctx)

	config := string(fake.Files[dropIn])

	for _, want := range []string{"port 6380", "appendonly no", "maxmemory 512mb", "maxmemory-policy allkeys-lru"} {
		if !strings.Contains(config, want) {
			t.Errorf("configuration lacks %q:\n%s", want, config)
		}
	}

	if status, _ := (Module{}).Status(ctx); status.Port != 6380 {
		t.Fatalf("status reports port %d", status.Port)
	}
}

func TestTheChosenPolicyOnlyAppliesUnderACap(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, modtest.Values{"port": DefaultPort, "persistence": true, "maxmemory_mb": 256, "maxmemory_policy": "volatile-ttl"})

	run(t, ctx)

	if config := string(fake.Files[dropIn]); !strings.Contains(config, "maxmemory-policy volatile-ttl") {
		t.Errorf("configuration lacks the chosen policy:\n%s", config)
	}

	uncapped := modtest.NewFakeSys()
	run(t, newContext(t, uncapped, modtest.Values{"port": DefaultPort, "persistence": true, "maxmemory_mb": 0, "maxmemory_policy": "volatile-ttl"}))

	config := string(uncapped.Files[dropIn])
	if !strings.Contains(config, "maxmemory-policy "+noEviction) || strings.Contains(config, "maxmemory ") {
		t.Errorf("without a cap nothing is evicted:\n%s", config)
	}
}

func TestSecretNeverLeaves(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake, values)

	run(t, ctx)

	for _, line := range ctx.Output() {
		if strings.Contains(line, password) {
			t.Fatalf("secret in output: %s", line)
		}
	}

	if fake.EnvValue(passwordKey) != password {
		t.Fatal("the password must be stored in /etc/pupitre/env")
	}
}

func TestReplayOnAnInstalledMachineChangesNothing(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, values))

	restarts := fake.Restarts[unit]

	ctx := newContext(t, fake, values)
	run(t, ctx)

	for step, status := range statuses(ctx) {
		if status != contract.StepSkip {
			t.Errorf("replay: %s = %s, want skip", step, status)
		}
	}

	if fake.Restarts[unit] != restarts {
		t.Fatalf("redis restarted %d times on an installed machine", fake.Restarts[unit]-restarts)
	}
}

func reconfigure(t *testing.T, fake *modtest.FakeSys, chosen modtest.Values, secret string) *modules.Context {
	t.Helper()

	ctx := modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Values: chosen, Secrets: modtest.Secrets{"password": secret}})
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	return ctx
}

func configSets(fake *modtest.FakeSys) (stdin string, auth []string) {
	for _, call := range fake.Calls {
		if call.Argv[0] == "redis-cli" && len(call.Stdin) > 0 {
			return string(call.Stdin), call.Env
		}
	}

	return "", nil
}

func TestANewPasswordIsSetOnTheRunningServerWithoutARestart(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, modtest.Values{"port": DefaultPort, "persistence": false, "maxmemory_mb": 256}))
	restarts := fake.Restarts[unit]

	ctx := reconfigure(t, fake, modtest.Values{"port": DefaultPort, "persistence": false, "maxmemory_mb": 512}, "n3w-secret")

	if statuses(ctx)["apply-config"] != contract.StepOK || statuses(ctx)["enable-service"] != contract.StepSkip || fake.Restarts[unit] != restarts {
		t.Fatalf("the settings must be applied live: %v, restarts %d", statuses(ctx), fake.Restarts[unit]-restarts)
	}

	stdin, auth := configSets(fake)

	for _, want := range []string{`CONFIG SET requirepass "n3w-secret"`, "CONFIG SET maxmemory 512mb", "CONFIG SET maxmemory-policy allkeys-lru", `CONFIG SET save ""`} {
		if !strings.Contains(stdin, want) {
			t.Errorf("redis-cli must be told %q on its standard input:\n%s", want, stdin)
		}
	}

	if !slices.Contains(auth, "REDISCLI_AUTH="+password) {
		t.Fatalf("the old password opens the connection that sets the new one, env = %v", auth)
	}

	if !strings.Contains(string(fake.Files[dropIn]), `requirepass "n3w-secret"`) || fake.EnvValue(passwordKey) != "n3w-secret" {
		t.Fatal("the drop-in and /etc/pupitre/env must carry the new password all the same")
	}

	for _, line := range ctx.Output() {
		if strings.Contains(line, "n3w-secret") || strings.Contains(line, password) {
			t.Fatalf("secret in output: %s", line)
		}
	}
}

func TestANewPortStillRestartsTheServer(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, values))
	restarts := fake.Restarts[unit]

	ctx := reconfigure(t, fake, modtest.Values{"port": 6380, "persistence": true, "maxmemory_mb": 0}, password)

	if statuses(ctx)["apply-config"] != contract.StepSkip || fake.Restarts[unit] != restarts+1 {
		t.Fatalf("a new port needs the restart: %v, restarts %d", statuses(ctx), fake.Restarts[unit]-restarts)
	}
}

func TestARefusedLiveApplyFallsBackOnTheRestart(t *testing.T) {
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, values))
	restarts := fake.Restarts[unit]
	fake.Replies["redis-cli -p 6379 --no-auth-warning"] = "OK\n(error) ERR Unsupported CONFIG parameter\n"

	ctx := reconfigure(t, fake, values, "n3w-secret")

	if statuses(ctx)["apply-config"] != contract.StepSkip || fake.Restarts[unit] != restarts+1 {
		t.Fatalf("the restart must follow a refusal: %v, restarts %d", statuses(ctx), fake.Restarts[unit]-restarts)
	}
}

func TestFailedStepReportsItsReplayCommand(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailPackage(pkg, "E: Unable to locate package redis-server")
	ctx := newContext(t, fake, values)

	if err := (Module{}).Install(ctx); err == nil {
		t.Fatal("expected install to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only=db.redis" {
		t.Fatalf("unexpected event: %+v", last)
	}
}

var _ modules.Module = Module{}

func TestVerifyAuthKeepsThePasswordOutOfTheArgv(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Packages[pkg] = "7.0.15"
	fake.Replies["redis-cli"] = "PONG\n"
	ctx := newContext(t, fake, nil)

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	var ping *sys.Command

	for i := range fake.Calls {
		if fake.Calls[i].Argv[0] == "redis-cli" {
			ping = &fake.Calls[i]
		}
	}

	if ping == nil {
		t.Fatal("redis-cli was never run")
	}

	if strings.Contains(strings.Join(ping.Argv, " "), password) || slices.Contains(ping.Argv, "-a") {
		t.Fatalf("the password must not reach the argv ps shows: %v", ping.Argv)
	}

	if !slices.Contains(ping.Env, "REDISCLI_AUTH="+password) {
		t.Fatalf("redis-cli reads its password from REDISCLI_AUTH, env = %v", ping.Env)
	}
}

func TestThePasswordIsQuotedInTheDropInAndOnTheLiveServer(t *testing.T) {
	typed := `pass "with" space #hash \slash`
	fake := modtest.NewFakeSys()
	run(t, newContext(t, fake, values))

	reconfigure(t, fake, values, typed)

	want := `requirepass "pass \"with\" space #hash \\slash"`

	if !strings.Contains(string(fake.Files[dropIn]), want+"\n") {
		t.Fatalf("drop-in:\n%s\nwant %s", fake.Files[dropIn], want)
	}

	if stdin, _ := configSets(fake); !strings.Contains(stdin, `CONFIG SET requirepass "pass \"with\" space #hash \\slash"`) {
		t.Fatalf("CONFIG SET:\n%s", stdin)
	}
}
