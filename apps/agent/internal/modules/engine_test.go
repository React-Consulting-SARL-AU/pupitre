package modules_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"syscall"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/license"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/state"
)

const secret = "s3cret-de-test"

func licensed(value contract.License) func() contract.License {
	return func() contract.License { return value }
}

func newEngine(t *testing.T, fake *modtest.FakeSys, registry *modules.Registry, current func() contract.License) *modules.Engine {
	t.Helper()

	dir := t.TempDir()

	return &modules.Engine{
		Registry:     registry,
		Sys:          fake,
		Now:          modtest.NewClock(10 * time.Millisecond).Now,
		License:      current,
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
	engine := newEngine(t, fake, registry, licensed(contract.LicenseValid))

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

	want := []string{"db.broken"}
	if !reflect.DeepEqual(result.Failed, want) {
		t.Fatalf("failed = %q, want %q", result.Failed, want)
	}

	var broken *contract.StepEvent
	for i := range events {
		if events[i].Module == "db.broken" && events[i].Status == contract.StepFail {
			broken = &events[i]
		}
	}
	if broken == nil || broken.Message != "E: Unable to locate package db-broken" || broken.Replay != "sudo pupitred install --only=db.broken" {
		t.Fatalf("the fail event must carry the message and the replay: %+v", broken)
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
	engine := newEngine(t, fake, registry, licensed(contract.LicenseValid))
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

func TestInstallRefusesWithoutLicense(t *testing.T) {
	for _, state := range []contract.License{contract.LicenseRestricted, ""} {
		fake := modtest.NewFakeSys()
		engine := newEngine(t, fake, demoRegistry(modtest.Passing{ID: "tool.demo"}), licensed(state))

		var events []contract.StepEvent
		_, err := engine.Install(modules.Request{Modules: []string{"tool.demo"}}, collect(&events))
		if code := protocolCode(t, err); code != contract.ErrorLicenseRequired {
			t.Fatalf("license %q: code = %s, want license_required", state, code)
		}

		if _, err := engine.Uninstall([]string{"tool.demo"}, nil); protocolCode(t, err) != contract.ErrorLicenseRequired {
			t.Fatalf("uninstall must refuse too")
		}

		if _, err := engine.Upgrade(modules.Request{}, nil); protocolCode(t, err) != contract.ErrorLicenseRequired {
			t.Fatalf("upgrade must refuse too")
		}

		if len(events) != 0 || len(fake.Calls) != 0 {
			t.Fatalf("nothing must run without license: %d events, %d calls", len(events), len(fake.Calls))
		}

		if _, err := os.Stat(engine.ReportPath); err == nil {
			t.Fatal("no report must be written without license")
		}
	}

	for _, state := range []contract.License{contract.LicenseValid, contract.LicenseGrace, contract.LicenseDev} {
		engine := newEngine(t, modtest.NewFakeSys(), demoRegistry(modtest.Passing{ID: "tool.demo"}), licensed(state))

		result, err := engine.Install(modules.Request{Modules: []string{"tool.demo"}}, nil)
		if err != nil || len(result.Failed) != 0 {
			t.Fatalf("license %q: install = %+v, %v", state, result, err)
		}
	}
}

func TestDefaultLicenseIsTheBuild(t *testing.T) {
	engine := newEngine(t, modtest.NewFakeSys(), demoRegistry(modtest.Passing{ID: "tool.demo"}), nil)

	_, err := engine.Install(modules.Request{Modules: []string{"tool.demo"}}, nil)

	if license.Current() == contract.LicenseDev {
		if err != nil {
			t.Fatalf("dev build must install: %v", err)
		}
		return
	}

	if protocolCode(t, err) != contract.ErrorLicenseRequired {
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
	engine := newEngine(t, fake, registry, licensed(contract.LicenseValid))

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
	engine := newEngine(t, fake, registry, licensed(contract.LicenseDev))

	result, err := engine.Install(modules.Request{Modules: []string{"ai.panic", "tool.demo"}}, nil)
	if err != nil {
		t.Fatal(err)
	}

	if !reflect.DeepEqual(result.Failed, []string{"ai.panic"}) {
		t.Fatalf("failed = %v", result.Failed)
	}

	var panicked *contract.ReportStep
	for _, step := range readReport(t, engine).Modules[0].Steps {
		if step.Status == contract.StepFail {
			panicked = &step
		}
	}
	if panicked == nil || !strings.Contains(panicked.Message, "panique") {
		t.Fatalf("the report must keep the panic: %+v", panicked)
	}

	if fake.Packages["tool-demo"] == "" {
		t.Fatal("tool.demo must still be installed")
	}
}

func TestWarningsAreAccountedWithoutFailing(t *testing.T) {
	engine := newEngine(t, modtest.NewFakeSys(), demoRegistry(modtest.Failing{ID: "tool.noisy", WarnWith: "port 8080 is already taken"}), licensed(contract.LicenseDev))

	result, err := engine.Install(modules.Request{Modules: []string{"tool.noisy"}}, nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Failed) != 0 || !reflect.DeepEqual(result.Warned, []string{"tool.noisy"}) {
		t.Fatalf("result = %+v", result)
	}

	report := readReport(t, engine)
	if report.Modules[0].Status != contract.ModuleWarn {
		t.Fatalf("module status = %s, want warn", report.Modules[0].Status)
	}

	var said []string
	for _, step := range report.Modules[0].Steps {
		if step.Message != "" {
			said = append(said, step.Message)
		}
	}
	if !reflect.DeepEqual(said, []string{"port 8080 is already taken"}) {
		t.Fatalf("the warning must ride on a step of the report: %v", said)
	}
}

func TestUninstallRunsInReverseOrderAndForgetsTheRequest(t *testing.T) {
	fake := modtest.NewFakeSys()
	registry := demoRegistry(
		modtest.Passing{ID: "core.system"},
		modtest.Passing{ID: "tool.demo", Requires: []string{"core.system"}, Unit: "demo", EnvKey: "DEMO_PASSWORD"},
	)
	engine := newEngine(t, fake, registry, licensed(contract.LicenseValid))

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
	engine := newEngine(t, fake, registry, licensed(contract.LicenseValid))

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

const openReport = `{"started_at":"2026-09-17T10:00:00Z","agent_version":"0.0.0-test","modules":[{"id":"core.system","status":"ok","steps":[{"step":"install-package","status":"ok","ms":3}]},{"id":"tool.demo","status":"ok","steps":[{"step":"install-package","status":"ok","ms":2},{"step":"write-config","status":"start"}]}],"failed":[],"warned":[],"report_path":"%s"}
`

func TestAnOpenReportWithNoLockHolderIsAnsweredInterrupted(t *testing.T) {
	engine := newEngine(t, modtest.NewFakeSys(), newRegistry(), licensed(contract.LicenseValid))
	engine.LockPath = filepath.Join(t.TempDir(), "install.lock")
	if err := os.WriteFile(engine.ReportPath, []byte(fmt.Sprintf(openReport, engine.ReportPath)), 0o644); err != nil {
		t.Fatal(err)
	}

	report, err := engine.Report()
	if err != nil {
		t.Fatal(err)
	}

	if report.FinishedAt == "" || !reflect.DeepEqual(report.Failed, []string{"tool.demo"}) {
		t.Fatalf("report = %+v", report)
	}

	demo := report.Modules[1]
	if demo.Status != contract.ModuleFail || demo.Steps[1].Status != contract.StepFail || demo.Steps[1].Message == "" || report.Modules[0].Status != contract.ModuleOK {
		t.Fatalf("the open step must fail with a reason, the finished module stay: %+v", report.Modules)
	}

	if err := contract.ValidateValue("ReportResult", report); err != nil {
		t.Fatal(err)
	}
}

func TestAnOpenReportWhileTheLockIsHeldStaysOpen(t *testing.T) {
	engine := newEngine(t, modtest.NewFakeSys(), newRegistry(), licensed(contract.LicenseValid))
	engine.LockPath = filepath.Join(t.TempDir(), "install.lock")
	if err := os.WriteFile(engine.ReportPath, []byte(fmt.Sprintf(openReport, engine.ReportPath)), 0o644); err != nil {
		t.Fatal(err)
	}

	held, err := os.OpenFile(engine.LockPath, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	defer held.Close()
	if err := syscall.Flock(int(held.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Fatal(err)
	}

	report, err := engine.Report()
	if err != nil {
		t.Fatal(err)
	}

	if report.FinishedAt != "" || report.Modules[1].Steps[1].Status != contract.StepStart {
		t.Fatalf("a run under way must read as under way: %+v", report)
	}
}

func TestTheReportIsRootsAlone(t *testing.T) {
	engine := newEngine(t, modtest.NewFakeSys(), demoRegistry(modtest.Passing{ID: "tool.demo"}), licensed(contract.LicenseDev))
	if err := os.WriteFile(engine.ReportPath, []byte("{}\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := engine.Install(modules.Request{Modules: []string{"tool.demo"}}, nil); err != nil {
		t.Fatal(err)
	}

	info, err := os.Stat(engine.ReportPath)
	if err != nil {
		t.Fatal(err)
	}

	if info.Mode().Perm() != 0o600 {
		t.Fatalf("report mode = %o, want 0600 even over one an older agent left readable", info.Mode().Perm())
	}
}

func TestReportBeforeAnyInstall(t *testing.T) {
	engine := newEngine(t, modtest.NewFakeSys(), newRegistry(), licensed(contract.LicenseValid))

	_, err := engine.Report()
	if protocolCode(t, err) != contract.ErrorNoReport {
		t.Fatalf("got %v", err)
	}
}

func TestSecretsNeverLeak(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailProgram("systemctl", "Failed to enable unit: "+secret+" rejected")
	registry := demoRegistry(modtest.Passing{ID: "tool.demo", Unit: "demo", EnvKey: "DEMO_PASSWORD"})
	engine := newEngine(t, fake, registry, licensed(contract.LicenseValid))

	var events []contract.StepEvent
	result, err := engine.Install(modules.Request{Modules: []string{"tool.demo"}, Secrets: map[string]map[string]string{"tool.demo": {"password": secret}}}, collect(&events))
	if err != nil {
		t.Fatal(err)
	}

	if !reflect.DeepEqual(result.Failed, []string{"tool.demo"}) {
		t.Fatalf("failed = %v", result.Failed)
	}

	for _, event := range events {
		if event.Status == contract.StepFail && (strings.Contains(event.Message, secret) || !strings.Contains(event.Message, "[secret]")) {
			t.Fatalf("the fail event must carry the redacted stderr: %+v", event)
		}
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
	engine := newEngine(t, modtest.NewFakeSys(), demoRegistry(modtest.Passing{ID: "tool.demo"}), licensed(contract.LicenseDev))
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

	return newEngine(t, fake, registry, licensed(contract.LicenseDev)), fake
}

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

func TestADeferredModuleWaitsForTheRequestThatAnswersForIt(t *testing.T) {
	fake := modtest.NewFakeSys()
	registry := demoRegistry(
		modtest.Passing{ID: "core.system"},
		modtest.Passing{ID: "tool.demo", Requires: []string{"core.system"}, Unit: "demo", EnvKey: "DEMO_PASSWORD"},
	)
	engine := newEngine(t, fake, registry, licensed(contract.LicenseValid))

	var events []contract.StepEvent
	if _, err := engine.Install(modules.Request{Modules: []string{"tool.demo"}, Defer: []string{"tool.demo"}, Persist: true}, collect(&events)); err != nil {
		t.Fatal(err)
	}

	for _, event := range events {
		if event.Module == "tool.demo" && event.Step == "write-config" {
			t.Fatal("the configure step ran on a module put off for later")
		}
	}
	if fake.EnvValue("DEMO_PASSWORD") != "" || fake.Units["demo"] != modtest.UnitAbsent {
		t.Fatal("a deferred module must be put on the machine and no further")
	}
	if !reflect.DeepEqual(engine.Deferred(), []string{"tool.demo"}) {
		t.Fatalf("the engine must remember what it left unconfigured, got %v", engine.Deferred())
	}

	fake.Upgrades["tool-demo"] = "2.0"
	events = nil
	if _, err := engine.Upgrade(modules.Request{}, collect(&events)); err != nil {
		t.Fatal(err)
	}

	for _, event := range events {
		if event.Module == "tool.demo" {
			t.Fatal("an upgrade must leave a module nobody configured alone")
		}
	}
	if fake.Packages["tool-demo"] == "2.0" {
		t.Fatal("the deferred module was upgraded")
	}

	// A replay from the machine names it without answering: refused before its first step.
	if _, err := engine.Install(modules.Request{Modules: []string{"tool.demo"}, Persist: true}, nil); protocolCode(t, err) != contract.ErrorInvalidConfig {
		t.Fatalf("got %v", err)
	}
	if !reflect.DeepEqual(engine.Deferred(), []string{"tool.demo"}) {
		t.Fatalf("a refused request must not change what is deferred, got %v", engine.Deferred())
	}

	request := modules.Request{Modules: []string{"tool.demo"}, Secrets: map[string]map[string]string{"tool.demo": {"password": secret}}, Persist: true}
	if _, err := engine.Install(request, nil); err != nil {
		t.Fatal(err)
	}

	if len(engine.Deferred()) != 0 {
		t.Fatalf("an answered module is deferred no more, got %v", engine.Deferred())
	}
	if fake.EnvValue("DEMO_PASSWORD") != secret || fake.Units["demo"] != modtest.UnitActive {
		t.Fatal("the answering request did not configure the module")
	}
}

func TestDeferringAMandatoryModuleIsRefused(t *testing.T) {
	fake := modtest.NewFakeSys()
	registry := demoRegistry(modtest.Passing{ID: "core.system", Mandatory: true})
	engine := newEngine(t, fake, registry, licensed(contract.LicenseValid))
	request := modules.Request{Modules: []string{"core.system"}, Defer: []string{"core.system"}, Persist: true}

	if _, err := engine.Install(request, nil); protocolCode(t, err) != contract.ErrorBadRequest {
		t.Fatalf("got %v", err)
	}
	if _, err := engine.Check(request, nil); protocolCode(t, err) != contract.ErrorBadRequest {
		t.Fatalf("got %v", err)
	}
	if _, present := fake.Packages["core-system"]; present {
		t.Fatal("a refused request must not touch the machine")
	}
}

func TestUninstallForgetsThatAModuleWasDeferred(t *testing.T) {
	fake := modtest.NewFakeSys()
	registry := demoRegistry(modtest.Passing{ID: "tool.demo", Unit: "demo", EnvKey: "DEMO_PASSWORD"})
	engine := newEngine(t, fake, registry, licensed(contract.LicenseValid))

	if _, err := engine.Install(modules.Request{Modules: []string{"tool.demo"}, Defer: []string{"tool.demo"}, Persist: true}, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := engine.Uninstall([]string{"tool.demo"}, nil); err != nil {
		t.Fatal(err)
	}

	if len(engine.Deferred()) != 0 {
		t.Fatalf("got %v", engine.Deferred())
	}
}

func TestAddingAModuleKeepsWhatItsRequirementWasToldBefore(t *testing.T) {
	fake := modtest.NewFakeSys()
	identity := contract.Field{Key: "git_name", Kind: contract.FieldText, Label: "Nom git", Required: true, MinLength: 2}
	registry := demoRegistry(
		modtest.Passing{ID: "core.system", Mandatory: true, Asks: []contract.Field{identity}},
		modtest.Passing{ID: "tool.demo", Requires: []string{"core.system"}, Unit: "demo"},
	)
	engine := newEngine(t, fake, registry, licensed(contract.LicenseValid))

	first := modules.Request{Modules: []string{"core.system"}, Config: map[string]map[string]any{"core.system": {"git_name": "Ada"}}, Persist: true}
	if _, err := engine.Install(first, nil); err != nil {
		t.Fatal(err)
	}

	later := modules.Request{Modules: []string{"tool.demo"}, Config: map[string]map[string]any{"tool.demo": {"port": 9000}}, Persist: true}
	if _, err := engine.Check(later, nil); err != nil {
		t.Fatalf("weighing the addition must not ask the core's questions again: %v", err)
	}
	if _, err := engine.Install(later, nil); err != nil {
		t.Fatalf("adding a module must not ask the core's questions again: %v", err)
	}

	kept, err := engine.Config("core.system")
	if err != nil {
		t.Fatal(err)
	}
	if kept.Values["git_name"] != "Ada" {
		t.Fatalf("the core's answers were lost: %v", kept.Values)
	}
	if string(fake.Files["/etc/pupitre/demo/tool.demo.conf"]) != "port=9000\n" {
		t.Fatalf("the added module did not get its own values: %s", fake.Files["/etc/pupitre/demo/tool.demo.conf"])
	}

	// Naming the core again replaces its configuration whole, as the contract says.
	again := modules.Request{Modules: []string{"core.system"}, Config: map[string]map[string]any{"core.system": {"git_name": "Grace"}}, Persist: true}
	if _, err := engine.Install(again, nil); err != nil {
		t.Fatal(err)
	}
	if kept, _ = engine.Config("core.system"); kept.Values["git_name"] != "Grace" {
		t.Fatalf("got %v", kept.Values)
	}
}

func TestARequirementLeftForLaterStaysForLater(t *testing.T) {
	fake := modtest.NewFakeSys()
	registry := demoRegistry(
		modtest.Passing{ID: "tool.base", Unit: "base", EnvKey: "BASE_PASSWORD"},
		modtest.Passing{ID: "tool.top", Requires: []string{"tool.base"}},
	)
	engine := newEngine(t, fake, registry, licensed(contract.LicenseValid))

	if _, err := engine.Install(modules.Request{Modules: []string{"tool.base"}, Defer: []string{"tool.base"}, Persist: true}, nil); err != nil {
		t.Fatal(err)
	}

	var events []contract.StepEvent
	if _, err := engine.Install(modules.Request{Modules: []string{"tool.top"}, Persist: true}, collect(&events)); err != nil {
		t.Fatalf("the requirement's unanswered questions must not refuse the addition: %v", err)
	}

	for _, event := range events {
		if event.Module == "tool.base" && event.Step == "write-config" {
			t.Fatal("a requirement left for later was configured on the way")
		}
	}
	if !reflect.DeepEqual(engine.Deferred(), []string{"tool.base"}) {
		t.Fatalf("got %v", engine.Deferred())
	}
}

func TestTheReportIsOnDiskBeforeEveryStepEvent(t *testing.T) {
	engine := newEngine(t, modtest.NewFakeSys(), demoRegistry(modtest.Passing{ID: "tool.demo"}, modtest.Passing{ID: "tool.other"}), licensed(contract.LicenseDev))

	var seen []string
	sink := func(event contract.StepEvent) {
		report := readReport(t, engine)
		if report.FinishedAt != "" {
			t.Errorf("%s %s %s: the report says finished while the run goes on", event.Module, event.Step, event.Status)
		}

		last := report.Modules[len(report.Modules)-1]
		if last.ID != event.Module {
			t.Errorf("%s %s %s: the report ends on %s", event.Module, event.Step, event.Status, last.ID)
		}

		step := last.Steps[len(last.Steps)-1]
		if step.Step != event.Step || step.Status != event.Status {
			t.Errorf("%s %s %s: the report's last step is %s %s", event.Module, event.Step, event.Status, step.Step, step.Status)
		}

		seen = append(seen, event.Module+" "+event.Step+" "+string(event.Status))
	}

	if _, err := engine.Install(modules.Request{Modules: []string{"tool.demo", "tool.other"}}, sink); err != nil {
		t.Fatal(err)
	}

	if len(seen) == 0 {
		t.Fatal("no step event")
	}

	report := readReport(t, engine)
	if report.FinishedAt == "" || len(report.Modules) != 2 {
		t.Fatalf("the finished report is not whole: %+v", report)
	}

	for _, module := range report.Modules {
		for _, step := range module.Steps {
			if step.Status == contract.StepStart {
				t.Errorf("%s: a finished report keeps an open step %s", module.ID, step.Step)
			}
		}
	}
}

func TestUninstallRefusesAModuleAnotherInstalledOneStillRequires(t *testing.T) {
	fake := modtest.NewFakeSys()
	registry := demoRegistry(
		modtest.Passing{ID: "core.system"},
		modtest.Passing{ID: "tool.demo", Requires: []string{"core.system"}, Unit: "demo", EnvKey: "DEMO_PASSWORD"},
	)
	engine := newEngine(t, fake, registry, licensed(contract.LicenseValid))

	if _, err := engine.Install(modules.Request{Modules: []string{"tool.demo"}, Secrets: map[string]map[string]string{"tool.demo": {"password": secret}}, Persist: true}, nil); err != nil {
		t.Fatal(err)
	}

	mutations := len(fake.Mutations)
	_, err := engine.Uninstall([]string{"core.system"}, nil)

	var refusal *protocol.Error
	if !errors.As(err, &refusal) || refusal.Code != contract.ErrorBadRequest || !strings.Contains(refusal.Message, "tool.demo") || !strings.Contains(refusal.Fix, "tool.demo") {
		t.Fatalf("uninstall of a requirement got %v, want a refusal naming tool.demo", err)
	}

	if len(fake.Mutations) != mutations || fake.Packages["core-system"] == "" {
		t.Fatalf("a refused uninstall must touch nothing: %v", fake.Mutations[mutations:])
	}

	if _, err := engine.Uninstall([]string{"core.system", "tool.demo"}, nil); err != nil {
		t.Fatalf("removing both together must pass: %v", err)
	}
}

func TestInspectAnswersWhileAnotherProcessHoldsTheLock(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Packages["tool-demo"] = "1.0"
	registry := demoRegistry(modtest.Passing{ID: "tool.demo"})
	engine := newEngine(t, fake, registry, licensed(contract.LicenseValid))
	engine.LockPath = filepath.Join(t.TempDir(), "install.lock")

	held, err := os.OpenFile(engine.LockPath, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	defer held.Close()
	if err := syscall.Flock(int(held.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Fatal(err)
	}

	var refusal *protocol.Error
	if err := engine.Command("tool.demo", nil, func(*modules.Context) error { return nil }); !errors.As(err, &refusal) || refusal.Code != contract.ErrorBusy {
		t.Fatalf("a command under a held lock got %v, want busy", err)
	}

	module, _ := registry.Get("tool.demo")
	installed := false
	if err := engine.Inspect("tool.demo", func(ctx *modules.Context) error {
		status, err := module.Check(ctx)
		installed = status.Installed

		return err
	}); err != nil || !installed {
		t.Fatalf("a read under a held lock must still answer: installed %v, err %v", installed, err)
	}
}

func versionedRegistry() *modules.Registry {
	return demoRegistry(
		modtest.Passing{ID: "core.system"},
		modtest.Passing{ID: "db.demo", Requires: []string{"core.system"}, Unit: "demo", Versioned: true},
	)
}

func installVersioned(t *testing.T, engine *modules.Engine) {
	t.Helper()

	request := modules.Request{
		Modules: []string{"db.demo"},
		Config:  map[string]map[string]any{"db.demo": {modtest.VersionField: modtest.OtherVersion}},
		Persist: true,
	}
	if _, err := engine.Install(request, nil); err != nil {
		t.Fatal(err)
	}
}

func TestUpgradeAndUninstallReadTheModuleOnTheRememberedValues(t *testing.T) {
	fake := modtest.NewFakeSys()
	engine := newEngine(t, fake, versionedRegistry(), licensed(contract.LicenseValid))
	installVersioned(t, engine)
	fake.Upgrades[modtest.Passing{ID: "db.demo"}.PackageAt(modtest.OtherVersion)] = "2.1"

	var events []contract.StepEvent
	if _, err := engine.Upgrade(modules.Request{}, collect(&events)); err != nil {
		t.Fatal(err)
	}

	touched := map[string]bool{}
	for _, event := range events {
		touched[event.Module] = true
	}
	if !touched["db.demo"] {
		t.Fatalf("upgrade {} must find the module installed on its remembered version, touched %v", touched)
	}

	result, err := engine.Uninstall([]string{"db.demo"}, nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Failed) != 0 {
		t.Fatalf("uninstall failed: %v", result.Failed)
	}
	if _, present := fake.Packages[modtest.Passing{ID: "db.demo"}.PackageAt(modtest.OtherVersion)]; present {
		t.Fatal("uninstall must remove the package of the remembered version")
	}
}

func TestSnapshotReadsTheModuleOnTheRememberedValues(t *testing.T) {
	fake := modtest.NewFakeSys()
	engine := newEngine(t, fake, versionedRegistry(), licensed(contract.LicenseValid))
	installVersioned(t, engine)

	reader := state.FromEngine(engine, state.Options{})

	var listed []string
	for _, service := range reader.Snapshot().Services {
		listed = append(listed, service.ID)
	}
	if !slices.Contains(listed, "db.demo") {
		t.Fatalf("snapshot must list the module installed on another version than the default, got %v", listed)
	}

	if _, err := reader.ServiceStatus("db.demo"); err != nil {
		t.Fatalf("service.status must find the module: %v", err)
	}
}

func TestUpgradeAndUninstallLeaveAPackageTheClientInstalledAlone(t *testing.T) {
	fake := modtest.NewFakeSys()
	registry := demoRegistry(
		modtest.Passing{ID: "core.system"},
		modtest.Passing{ID: "db.theirs", Requires: []string{"core.system"}, Unit: "theirs"},
	)
	engine := newEngine(t, fake, registry, licensed(contract.LicenseValid))

	if _, err := engine.Install(modules.Request{Modules: []string{"core.system"}, Persist: true}, nil); err != nil {
		t.Fatal(err)
	}
	fake.Packages["db-theirs"] = "8.0"
	fake.Units["theirs"] = modtest.UnitActive

	var events []contract.StepEvent
	if _, err := engine.Upgrade(modules.Request{}, collect(&events)); err != nil {
		t.Fatal(err)
	}

	for _, event := range events {
		if event.Module == "db.theirs" {
			t.Fatalf("upgrade {} reconfigured a package the client installed: %+v", event)
		}
	}
	if _, present := fake.Files["/etc/pupitre/demo/db.theirs.conf"]; present {
		t.Fatal("upgrade wrote a configuration for a package the client installed")
	}

	_, err := engine.Uninstall([]string{"db.theirs"}, nil)
	if protocolCode(t, err) != contract.ErrorBadRequest {
		t.Fatalf("uninstall of a package the client installed must be refused, got %v", err)
	}
	if _, present := fake.Packages["db-theirs"]; !present {
		t.Fatal("uninstall removed a package the client installed")
	}
}

func TestConfigureAndPreflightSeeWhatTheMachineHolds(t *testing.T) {
	fake := modtest.NewFakeSys()
	holding := &heldRecorder{}
	registry := demoRegistry(modtest.Passing{ID: "core.system"}, holding)
	engine := newEngine(t, fake, registry, licensed(contract.LicenseValid))

	first := modules.Request{Modules: []string{"tool.held"}, Config: map[string]map[string]any{"tool.held": {"port": 9000}}, Persist: true}
	if _, err := engine.Install(first, nil); err != nil {
		t.Fatal(err)
	}
	if holding.configured != nil {
		t.Fatalf("nothing is held before the first install, got %v", holding.configured)
	}

	second := modules.Request{Modules: []string{"tool.held"}, Config: map[string]map[string]any{"tool.held": {"port": 9001}}, Persist: true}
	if _, err := engine.Check(second, nil); err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(holding.preflighted) != "9000" {
		t.Fatalf("preflight must see the held port 9000, got %v", holding.preflighted)
	}

	if _, err := engine.Install(second, nil); err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(holding.configured) != "9000" {
		t.Fatalf("configure must see the held port 9000, got %v", holding.configured)
	}

	if _, err := engine.Upgrade(modules.Request{Modules: []string{"tool.held"}}, nil); err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(holding.upgraded) != "9001" {
		t.Fatalf("upgrade must see the held port 9001, got %v", holding.upgraded)
	}
}

func TestAModuleIsConfiguredWithTheValueThatWasJudged(t *testing.T) {
	recorder := &domainRecorder{Passing: modtest.Passing{
		ID:   "tool.domain",
		Asks: []contract.Field{{Key: "domain", Kind: contract.FieldText, Label: "Domaine", Format: contract.FormatDomain, Required: true}},
	}}
	engine := newEngine(t, modtest.NewFakeSys(), demoRegistry(recorder), licensed(contract.LicenseValid))

	request := modules.Request{Modules: []string{"tool.domain"}, Config: map[string]map[string]any{"tool.domain": {"domain": "  Flyleaf.DEV\n"}}, Persist: true}
	if result, err := engine.Install(request, nil); err != nil || len(result.Failed) != 0 {
		t.Fatalf("install = %+v, %v", result, err)
	}

	if recorder.configured != "flyleaf.dev" {
		t.Fatalf("configure read %q, the value judged was flyleaf.dev", recorder.configured)
	}
}

type domainRecorder struct {
	modtest.Passing
	configured string
}

func (m *domainRecorder) Configure(ctx *modules.Context) error {
	m.configured = ctx.String("domain")

	return m.Passing.Configure(ctx)
}

type heldRecorder struct {
	modtest.Passing
	configured, preflighted, upgraded any
}

func (m *heldRecorder) Manifest() contract.Manifest {
	return modtest.Passing{ID: "tool.held"}.Manifest()
}

func (m *heldRecorder) Preflight(ctx *modules.Context) []contract.FieldProblem {
	m.preflighted = ctx.Held("port")

	return nil
}

func (m *heldRecorder) Configure(ctx *modules.Context) error {
	m.configured = ctx.Held("port")

	return modtest.Passing{ID: "tool.held"}.Configure(ctx)
}

func (m *heldRecorder) Upgrade(ctx *modules.Context) error {
	m.upgraded = ctx.Held("port")

	return modtest.Passing{ID: "tool.held"}.Upgrade(ctx)
}

func (m *heldRecorder) Check(ctx *modules.Context) (modules.Status, error) {
	return modtest.Passing{ID: "tool.held"}.Check(ctx)
}

func (m *heldRecorder) Install(ctx *modules.Context) error {
	return modtest.Passing{ID: "tool.held"}.Install(ctx)
}

func (m *heldRecorder) Uninstall(ctx *modules.Context) error {
	return modtest.Passing{ID: "tool.held"}.Uninstall(ctx)
}

func (m *heldRecorder) Status(ctx *modules.Context) (modules.Status, error) {
	return modtest.Passing{ID: "tool.held"}.Status(ctx)
}
