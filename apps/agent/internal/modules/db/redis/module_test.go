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
	for _, want := range []string{"bind 127.0.0.1 ::1", "port 6379", "requirepass " + password, "appendonly yes"} {
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

// The policy only decides what goes when the cap is reached; a Redis without a cap evicts nothing at all.
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
		if step != "verify-auth" && status != contract.StepSkip {
			t.Errorf("replay: %s = %s, want skip", step, status)
		}
	}

	if fake.Restarts[unit] != restarts {
		t.Fatalf("redis restarted %d times on an installed machine", fake.Restarts[unit]-restarts)
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
