package modules_test

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
)

const secret = "s3cret-de-test"

func entitled(value contract.Entitlement) func() contract.Entitlement {
	return func() contract.Entitlement { return value }
}

func newEngine(t *testing.T, fake *modtest.FakeSys, registry *modules.Registry, current func() contract.Entitlement) *modules.Engine {
	t.Helper()

	dir := t.TempDir()

	return &modules.Engine{
		Registry:     registry,
		Sys:          fake,
		Now:          modtest.NewClock(10 * time.Millisecond).Now,
		Entitlement:  current,
		AgentVersion: "0.0.0-test",
		ReportPath:   filepath.Join(dir, "report.json"),
		LogPath:      filepath.Join(dir, "pupitre.log"),
		InstallPath:  "/etc/pupitre/install.json",
	}
}

func demoRegistry(modules ...modules.Module) *modules.Registry {
	registry := newRegistry()
	for _, module := range modules {
		registry.Register(module)
	}

	return registry
}

func newRegistry() *modules.Registry {
	return modules.NewRegistry()
}

func collect(events *[]contract.StepEvent) modules.Sink {
	return func(event contract.StepEvent) {
		*events = append(*events, event)
	}
}

func readReport(t *testing.T, engine *modules.Engine) contract.Report {
	t.Helper()

	raw, err := os.ReadFile(engine.ReportPath)
	if err != nil {
		t.Fatalf("report not written: %v", err)
	}

	value, err := contract.Decode(raw)
	if err != nil {
		t.Fatal(err)
	}

	if err := contract.Validate("ReportResult", value); err != nil {
		t.Fatalf("report violates ReportResult: %v\n%s", err, raw)
	}

	var report contract.Report
	if err := json.Unmarshal(raw, &report); err != nil {
		t.Fatal(err)
	}

	return report
}

func protocolCode(t *testing.T, err error) contract.ErrorCode {
	t.Helper()

	var failure *protocol.Error
	if !errors.As(err, &failure) {
		t.Fatalf("expected a protocol error, got %v", err)
	}

	return failure.Code
}

func TestFailedModuleDoesNotStopTheNext(t *testing.T) {
	fake := modtest.NewFakeSys()
	registry := demoRegistry(
		modtest.Failing{ID: "db.broken", FailAt: "install-package", Message: "E: Unable to locate package db-broken"},
		modtest.Passing{ID: "tool.demo", Unit: "demo", EnvKey: "DEMO_PASSWORD"},
	)
	engine := newEngine(t, fake, registry, entitled(contract.EntitlementValid))

	var events []contract.StepEvent
	result, err := engine.Install(modules.Request{
		Modules: []string{"tool.demo", "db.broken"},
		Secrets: map[string]map[string]string{"tool.demo": {"password": secret}},
	}, collect(&events))
	if err != nil {
		t.Fatal(err)
	}

	if err := contract.ValidateValue("InstallResult", result); err != nil {
		t.Fatal(err)
	}

	want := []string{"db.broken · install-package : E: Unable to locate package db-broken · rejeu : sudo pupitred install --only=db.broken"}
	if !reflect.DeepEqual(result.Failed, want) {
		t.Fatalf("failed = %q, want %q", result.Failed, want)
	}

	if fake.Packages["tool-demo"] == "" || fake.Units["demo"] != modtest.UnitActive {
		t.Fatal("tool.demo must be installed after db.broken failed")
	}

	var demoSteps []string
	for _, event := range events {
		if event.Module == "tool.demo" && event.Status != contract.StepStart {
			demoSteps = append(demoSteps, event.Step+"="+string(event.Status))
		}
	}
	if !reflect.DeepEqual(demoSteps, []string{"install-package=ok", "write-config=ok", "store-password=ok", "enable-service=ok"}) {
		t.Fatalf("tool.demo steps = %v", demoSteps)
	}

	report := readReport(t, engine)
	raw, _ := json.MarshalIndent(report, "", "  ")
	t.Logf("report.json:\n%s", raw)

	if len(report.Modules) != 2 || report.Modules[0].ID != "db.broken" || report.Modules[0].Status != contract.ModuleFail || report.Modules[1].Status != contract.ModuleOK {
		t.Fatalf("unexpected module reports: %+v", report.Modules)
	}

	failed := report.Modules[0].Steps[1]
	if failed.Status != contract.StepFail || failed.Replay != "sudo pupitred install --only=db.broken" || failed.Message != "E: Unable to locate package db-broken" {
		t.Fatalf("unexpected failed step: %+v", failed)
	}

	if !reflect.DeepEqual(report.Failed, want) || report.ReportPath != engine.ReportPath {
		t.Fatalf("report accounting mismatch: %+v", report)
	}
}

func TestReplayOnInstalledMachineChangesNothing(t *testing.T) {
	fake := modtest.NewFakeSys()
	registry := demoRegistry(
		modtest.Passing{ID: "core.system"},
		modtest.Passing{ID: "tool.demo", Requires: []string{"core.system"}, Unit: "demo", EnvKey: "DEMO_PASSWORD"},
	)
	engine := newEngine(t, fake, registry, entitled(contract.EntitlementValid))
	request := modules.Request{
		Modules: []string{"tool.demo"},
		Config:  map[string]map[string]any{"tool.demo": {"port": 9000}},
		Secrets: map[string]map[string]string{"tool.demo": {"password": secret}},
		Persist: true,
	}

	if _, err := engine.Install(request, nil); err != nil {
		t.Fatal(err)
	}

	mutations := len(fake.Mutations)
	calls := len(fake.Calls)
	if mutations == 0 {
		t.Fatal("first install must change the machine")
	}

	var events []contract.StepEvent
	result, err := engine.Install(request, collect(&events))
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Failed) != 0 || len(result.Warned) != 0 {
		t.Fatalf("replay reported problems: %+v", result)
	}

	if len(events) == 0 {
		t.Fatal("replay emitted no step at all")
	}

	for _, event := range events {
		if event.Status != contract.StepStart && event.Status != contract.StepSkip {
			t.Errorf("replay: %s · %s = %s, want skip", event.Module, event.Step, event.Status)
		}
	}

	if len(fake.Mutations) != mutations {
		t.Fatalf("replay wrote to the machine: %v", fake.Mutations[mutations:])
	}

	t.Logf("first install: %d calls, %d mutations; replay: %d calls, 0 mutations", calls, mutations, len(fake.Calls)-calls)

	report := readReport(t, engine)
	for _, module := range report.Modules {
		if module.Status != contract.ModuleSkip {
			t.Errorf("%s status = %s, want skip", module.ID, module.Status)
		}
	}

	if fake.Modes["/etc/pupitre/install.json"] != 0o600 || !strings.Contains(string(fake.Files["/etc/pupitre/install.json"]), `"port": 9000`) {
		t.Fatalf("install.json must keep the request in 0600: %s", fake.Files["/etc/pupitre/install.json"])
	}
}

func TestInstallRefusesWithoutEntitlement(t *testing.T) {
	for _, state := range []contract.Entitlement{contract.EntitlementRestricted, ""} {
		fake := modtest.NewFakeSys()
		engine := newEngine(t, fake, demoRegistry(modtest.Passing{ID: "tool.demo"}), entitled(state))

		var events []contract.StepEvent
		_, err := engine.Install(modules.Request{Modules: []string{"tool.demo"}}, collect(&events))
		if code := protocolCode(t, err); code != contract.ErrorEntitlementRequired {
			t.Fatalf("entitlement %q: code = %s, want entitlement_required", state, code)
		}

		if _, err := engine.Uninstall([]string{"tool.demo"}, nil); protocolCode(t, err) != contract.ErrorEntitlementRequired {
			t.Fatalf("uninstall must refuse too")
		}

		if _, err := engine.Upgrade(modules.Request{}, nil); protocolCode(t, err) != contract.ErrorEntitlementRequired {
			t.Fatalf("upgrade must refuse too")
		}

		if len(events) != 0 || len(fake.Calls) != 0 {
			t.Fatalf("nothing must run without entitlement: %d events, %d calls", len(events), len(fake.Calls))
		}

		if _, err := os.Stat(engine.ReportPath); err == nil {
			t.Fatal("no report must be written without entitlement")
		}
	}

	for _, state := range []contract.Entitlement{contract.EntitlementValid, contract.EntitlementGrace, contract.EntitlementDev} {
		engine := newEngine(t, modtest.NewFakeSys(), demoRegistry(modtest.Passing{ID: "tool.demo"}), entitled(state))

		result, err := engine.Install(modules.Request{Modules: []string{"tool.demo"}}, nil)
		if err != nil || len(result.Failed) != 0 {
			t.Fatalf("entitlement %q: install = %+v, %v", state, result, err)
		}
	}
}

func TestDefaultEntitlementIsTheBuild(t *testing.T) {
	engine := newEngine(t, modtest.NewFakeSys(), demoRegistry(modtest.Passing{ID: "tool.demo"}), nil)

	_, err := engine.Install(modules.Request{Modules: []string{"tool.demo"}}, nil)

	if entitlement.Current() == contract.EntitlementDev {
		if err != nil {
			t.Fatalf("dev build must install: %v", err)
		}
		return
	}

	if protocolCode(t, err) != contract.ErrorEntitlementRequired {
		t.Fatalf("release build must refuse, got %v", err)
	}
}

func TestResolveExpandsRequiresAndOrdersByDependencyThenCategory(t *testing.T) {
	registry := demoRegistry(
		modtest.Passing{ID: "tool.github"},
		modtest.Passing{ID: "ai.claude", Requires: []string{"runtime.node"}},
		modtest.Passing{ID: "runtime.node", Requires: []string{"core.system"}},
		modtest.Passing{ID: "core.system"},
		modtest.Passing{ID: "core.hardening", Requires: []string{"core.system"}},
		modtest.Passing{ID: "db.mysql", Requires: []string{"core.system"}},
	)

	ordered, err := registry.Resolve([]string{"ai.claude", "tool.github", "db.mysql", "core.hardening"})
	if err != nil {
		t.Fatal(err)
	}

	var ids []string
	for _, module := range ordered {
		ids = append(ids, module.Manifest().ID)
	}

	want := []string{"core.system", "core.hardening", "runtime.node", "db.mysql", "ai.claude", "tool.github"}
	if !reflect.DeepEqual(ids, want) {
		t.Fatalf("order = %v, want %v", ids, want)
	}
}

func TestResolveRefusesConflictsUnknownModulesAndCycles(t *testing.T) {
	registry := demoRegistry(
		modtest.Passing{ID: "db.mysql", Conflicts: []string{"db.mariadb"}},
		modtest.Passing{ID: "db.mariadb"},
		modtest.Passing{ID: "tool.loop", Requires: []string{"tool.back"}},
		modtest.Passing{ID: "tool.back", Requires: []string{"tool.loop"}},
	)

	_, err := registry.Resolve([]string{"db.mariadb", "db.mysql"})
	if protocolCode(t, err) != contract.ErrorBadRequest || !strings.Contains(err.Error(), "db.mariadb and db.mysql") {
		t.Fatalf("conflict: %v", err)
	}

	_, err = registry.Resolve([]string{"db.nope"})
	if protocolCode(t, err) != contract.ErrorModuleNotFound {
		t.Fatalf("unknown: %v", err)
	}

	_, err = registry.Resolve([]string{"tool.loop"})
	if protocolCode(t, err) != contract.ErrorInternal || !strings.Contains(err.Error(), "circular") {
		t.Fatalf("cycle: %v", err)
	}
}

func TestInstallRefusesAConflictWithAnInstalledModule(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Packages["db-mariadb"] = "10.11"
	registry := demoRegistry(
		modtest.Passing{ID: "db.mysql", Conflicts: []string{"db.mariadb"}},
		modtest.Passing{ID: "db.mariadb"},
	)
	engine := newEngine(t, fake, registry, entitled(contract.EntitlementValid))

	_, err := engine.Install(modules.Request{Modules: []string{"db.mysql"}}, nil)
	if protocolCode(t, err) != contract.ErrorBadRequest || !strings.Contains(err.Error(), "already installed") {
		t.Fatalf("got %v", err)
	}
}

func TestPanicAndBareErrorsAreFailuresOfTheModuleOnly(t *testing.T) {
	fake := modtest.NewFakeSys()
	registry := demoRegistry(
		modtest.Failing{ID: "ai.panic", FailAt: "write-config", Panics: true},
		modtest.Passing{ID: "tool.demo"},
	)
	engine := newEngine(t, fake, registry, entitled(contract.EntitlementDev))

	result, err := engine.Install(modules.Request{Modules: []string{"ai.panic", "tool.demo"}}, nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Failed) != 1 || !strings.Contains(result.Failed[0], "ai.panic · write-config : panique") {
		t.Fatalf("failed = %v", result.Failed)
	}

	if fake.Packages["tool-demo"] == "" {
		t.Fatal("tool.demo must still be installed")
	}
}

func TestWarningsAreAccountedWithoutFailing(t *testing.T) {
	engine := newEngine(t, modtest.NewFakeSys(), demoRegistry(modtest.Failing{ID: "tool.noisy", WarnWith: "port 8080 is already taken"}), entitled(contract.EntitlementDev))

	result, err := engine.Install(modules.Request{Modules: []string{"tool.noisy"}}, nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Failed) != 0 || !reflect.DeepEqual(result.Warned, []string{"tool.noisy : port 8080 is already taken"}) {
		t.Fatalf("result = %+v", result)
	}

	if report := readReport(t, engine); report.Modules[0].Status != contract.ModuleWarn {
		t.Fatalf("module status = %s, want warn", report.Modules[0].Status)
	}
}

func TestUninstallRunsInReverseOrderAndForgetsTheRequest(t *testing.T) {
	fake := modtest.NewFakeSys()
	registry := demoRegistry(
		modtest.Passing{ID: "core.system"},
		modtest.Passing{ID: "tool.demo", Requires: []string{"core.system"}, Unit: "demo", EnvKey: "DEMO_PASSWORD"},
	)
	engine := newEngine(t, fake, registry, entitled(contract.EntitlementValid))

	if _, err := engine.Install(modules.Request{Modules: []string{"tool.demo"}, Secrets: map[string]map[string]string{"tool.demo": {"password": secret}}, Persist: true}, nil); err != nil {
		t.Fatal(err)
	}

	var events []contract.StepEvent
	result, err := engine.Uninstall([]string{"core.system", "tool.demo"}, collect(&events))
	if err != nil {
		t.Fatal(err)
	}

	if err := contract.ValidateValue("UninstallResult", result); err != nil {
		t.Fatal(err)
	}

	if len(result.Failed) != 0 || events[0].Module != "tool.demo" || events[len(events)-1].Module != "core.system" {
		t.Fatalf("uninstall order or result wrong: %+v / %+v", result, events)
	}

	if _, present := fake.Packages["tool-demo"]; present || fake.Units["demo"] != modtest.UnitInactive || fake.EnvValue("DEMO_PASSWORD") != "" {
		t.Fatal("tool.demo leftovers after uninstall")
	}

	if strings.Contains(string(fake.Files["/etc/pupitre/install.json"]), "tool.demo") {
		t.Fatalf("install.json still remembers tool.demo: %s", fake.Files["/etc/pupitre/install.json"])
	}
}

func TestUpgradeOnlyTouchesInstalledModulesAndKeepsTheirValues(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Upgrades["tool-demo"] = "2.0"
	registry := demoRegistry(
		modtest.Passing{ID: "core.system"},
		modtest.Passing{ID: "tool.demo", Requires: []string{"core.system"}, Unit: "demo", EnvKey: "DEMO_PASSWORD"},
		modtest.Passing{ID: "tool.absent"},
	)
	engine := newEngine(t, fake, registry, entitled(contract.EntitlementValid))

	request := modules.Request{
		Modules: []string{"tool.demo"},
		Config:  map[string]map[string]any{"tool.demo": {"port": 9000}},
		Secrets: map[string]map[string]string{"tool.demo": {"password": secret}},
		Persist: true,
	}
	if _, err := engine.Install(request, nil); err != nil {
		t.Fatal(err)
	}

	var events []contract.StepEvent
	result, err := engine.Upgrade(modules.Request{}, collect(&events))
	if err != nil {
		t.Fatal(err)
	}

	if err := contract.ValidateValue("UpgradeResult", result); err != nil {
		t.Fatal(err)
	}

	touched := map[string]bool{}
	for _, event := range events {
		touched[event.Module] = true
	}
	if touched["tool.absent"] || !touched["tool.demo"] || !touched["core.system"] {
		t.Fatalf("upgrade touched %v", touched)
	}

	if fake.Packages["tool-demo"] != "2.0" || fake.EnvValue("DEMO_PASSWORD") != secret || string(fake.Files["/etc/pupitre/demo/tool.demo.conf"]) != "port=9000\n" {
		t.Fatalf("upgrade lost the chosen values: %s / %q", fake.Files["/etc/pupitre/demo/tool.demo.conf"], fake.EnvValue("DEMO_PASSWORD"))
	}
}

func TestReportBeforeAnyInstall(t *testing.T) {
	engine := newEngine(t, modtest.NewFakeSys(), newRegistry(), entitled(contract.EntitlementValid))

	_, err := engine.Report()
	if protocolCode(t, err) != contract.ErrorNoReport {
		t.Fatalf("got %v", err)
	}
}

func TestSecretsNeverLeak(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailProgram("systemctl", "Failed to enable unit: "+secret+" rejected")
	registry := demoRegistry(modtest.Passing{ID: "tool.demo", Unit: "demo", EnvKey: "DEMO_PASSWORD"})
	engine := newEngine(t, fake, registry, entitled(contract.EntitlementValid))

	var events []contract.StepEvent
	result, err := engine.Install(modules.Request{Modules: []string{"tool.demo"}, Secrets: map[string]map[string]string{"tool.demo": {"password": secret}}}, collect(&events))
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Failed) != 1 || !strings.Contains(result.Failed[0], "[secret]") {
		t.Fatalf("expected the failure to carry the redacted stderr: %v", result.Failed)
	}

	for _, path := range []string{engine.ReportPath, engine.LogPath} {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}

		if strings.Contains(string(raw), secret) {
			t.Fatalf("secret leaked into %s", path)
		}
	}

	if fake.EnvValue("DEMO_PASSWORD") != secret {
		t.Fatal("the secret must still reach /etc/pupitre/env")
	}
}

func TestStepDurationsComeFromTheClock(t *testing.T) {
	engine := newEngine(t, modtest.NewFakeSys(), demoRegistry(modtest.Passing{ID: "tool.demo"}), entitled(contract.EntitlementDev))
	engine.Now = modtest.NewClock(time.Second).Now

	var events []contract.StepEvent
	if _, err := engine.Install(modules.Request{Modules: []string{"tool.demo"}}, collect(&events)); err != nil {
		t.Fatal(err)
	}

	for _, event := range events {
		if event.Status == contract.StepStart && event.Ms != 0 {
			t.Errorf("start event carries a duration: %+v", event)
		}

		if event.Status != contract.StepStart && event.Ms < 1000 {
			t.Errorf("terminal event without duration: %+v", event)
		}
	}

	report := readReport(t, engine)
	if report.StartedAt >= report.FinishedAt {
		t.Fatalf("clock did not advance: %s → %s", report.StartedAt, report.FinishedAt)
	}
}

func TestRegisterRefusesInvalidManifests(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("expected a panic for an invalid manifest")
		}
	}()

	newRegistry().Register(modtest.Passing{ID: "Not An Id"})
}

func demoEngine(t *testing.T) (*modules.Engine, *modtest.FakeSys) {
	t.Helper()

	fake := modtest.NewFakeSys()
	registry := demoRegistry(
		modtest.Passing{ID: "core.system"},
		modtest.Passing{ID: "tool.demo", Requires: []string{"core.system"}, Unit: "demo", EnvKey: "DEMO_PASSWORD"},
	)

	return newEngine(t, fake, registry, entitled(contract.EntitlementDev)), fake
}

// A configuration that would not hold is refused before the first step: the
// machine is left as it was, and every field is named at once rather than one
// per attempt.
func TestAnInvalidConfigurationIsRefusedBeforeAnythingIsTouched(t *testing.T) {
	engine, fake := demoEngine(t)

	_, err := engine.Install(modules.Request{
		Modules: []string{"tool.demo"},
		Config:  map[string]map[string]any{"tool.demo": {"port": "nope"}},
	}, nil)

	failure, isProtocol := err.(*protocol.Error)
	if !isProtocol || failure.Code != contract.ErrorInvalidConfig {
		t.Fatalf("want invalid_config, got %#v", err)
	}

	if failure.Fix == "" || failure.Remedy == nil || failure.Remedy.Code != contract.RemedyInvalidFields {
		t.Fatalf("a refusal carries its remedy: %+v", failure)
	}

	if len(fake.Mutations) != 0 {
		t.Fatalf("the machine was touched: %v", fake.Mutations)
	}
}

func TestCheckNamesEveryProblemAndChangesNothing(t *testing.T) {
	engine, fake := demoEngine(t)

	answer, err := engine.Check(modules.Request{
		Modules: []string{"tool.demo"},
		Config:  map[string]map[string]any{"tool.demo": {"port": "nope"}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(answer.Problems) != 1 || answer.Problems[0].Field != "port" {
		t.Fatalf("problems = %+v", answer.Problems)
	}

	for _, problem := range answer.Problems {
		if problem.Message == "" {
			t.Fatalf("a problem without a phrase: %+v", problem)
		}
	}

	if len(fake.Mutations) != 0 {
		t.Fatalf("check touched the machine: %v", fake.Mutations)
	}
}

// The app holds the vault and writes the secret line at install time; a server
// that called every secret it cannot see missing would be wrong every time.
func TestCheckNeverCallsASecretMissing(t *testing.T) {
	engine, _ := demoEngine(t)

	answer, err := engine.Check(modules.Request{
		Modules: []string{"tool.demo"},
		Config:  map[string]map[string]any{"tool.demo": {"port": 8080}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(answer.Problems) != 0 {
		t.Fatalf("problems = %+v", answer.Problems)
	}

	// The install does judge it: there the secret line is either present or not.
	_, err = engine.Install(modules.Request{
		Modules: []string{"tool.demo"},
		Config:  map[string]map[string]any{"tool.demo": {"port": 8080}},
	}, nil)

	failure, isProtocol := err.(*protocol.Error)
	if !isProtocol || failure.Code != contract.ErrorInvalidConfig {
		t.Fatalf("want invalid_config on a missing password, got %#v", err)
	}
}
