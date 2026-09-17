package state_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/state"
)

func serviceEngine(t *testing.T, fake *modtest.FakeSys) *modules.Engine {
	t.Helper()

	registry := modules.NewRegistry()
	registry.Register(modtest.Passing{ID: "tool.demo", Unit: "demo", Port: 8080, EnvKey: "DEMO_PASSWORD"})
	fake.Packages["tool-demo"] = "1.0"

	dir := t.TempDir()

	return &modules.Engine{
		Registry:    registry,
		Sys:         fake,
		Now:         modtest.NewClock(10 * time.Millisecond).Now,
		Entitlement: func() contract.Entitlement { return contract.EntitlementDev },
		ReportPath:  filepath.Join(dir, "report.json"),
		LogPath:     filepath.Join(dir, "pupitre.log"),
		InstallPath: "/etc/pupitre/install.json",
		LockPath:    filepath.Join(dir, "install.lock"),
	}
}

func hold(t *testing.T, path string) {
	t.Helper()

	held, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { held.Close() })

	if err := syscall.Flock(int(held.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Fatal(err)
	}
}

func codeOf(err error) contract.ErrorCode {
	var refusal *protocol.Error
	if errors.As(err, &refusal) {
		return refusal.Code
	}

	return ""
}

// Driving a unit is an act on the machine: it waits behind an install like tunnel.restart does, while reading the journal never does.
func TestDrivingAServiceWaitsBehindTheRunLockAndReadingDoesNot(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Units["demo"] = modtest.UnitFailed
	fake.Answer("journalctl -u demo", "demo: exited\n")

	engine := serviceEngine(t, fake)
	hold(t, engine.LockPath)
	reader := state.FromEngine(engine, state.Options{})

	for name, act := range map[string]func(string) (contract.ServiceStatus, error){
		"start":   reader.StartService,
		"stop":    reader.StopService,
		"restart": reader.RestartService,
	} {
		if _, err := act("tool.demo"); codeOf(err) != contract.ErrorBusy {
			t.Errorf("%s under a held lock got %v, want busy", name, err)
		}
	}

	if fake.Units["demo"] != modtest.UnitFailed {
		t.Fatalf("the unit moved to %q behind a held lock", fake.Units["demo"])
	}

	lines, err := reader.ServiceLogs("tool.demo", 0)
	if err != nil || strings.Join(lines, "") != "demo: exited" {
		t.Fatalf("logs under a held lock = %v, %v", lines, err)
	}
}

func TestAStartSystemdRefusesSaysSoAndPointsAtTheLogs(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Units["demo"] = modtest.UnitFailed
	fake.FailProgram("systemctl", "Job for demo.service failed because the control process exited with error code.")

	reader := state.FromEngine(serviceEngine(t, fake), state.Options{})

	_, err := reader.StartService("tool.demo")

	var refusal *protocol.Error
	if !errors.As(err, &refusal) || refusal.Code != contract.ErrorInternal {
		t.Fatalf("got %v, want an internal error carrying systemd's own words", err)
	}

	if !strings.Contains(refusal.Message, "control process exited") || !strings.Contains(refusal.Fix, "service.logs tool.demo") {
		t.Fatalf("message = %q, fix = %q", refusal.Message, refusal.Fix)
	}
}

// An action answers the state it left the unit in, and nothing a store must not hold: the credentials stay with service.status.
func TestAnActionAnswersTheRealStateWithoutTheCredentials(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Units["demo"] = modtest.UnitFailed

	reader := state.FromEngine(serviceEngine(t, fake), state.Options{})

	status, err := reader.ServiceStatus("tool.demo")
	if err != nil || status.State != contract.ServiceFailed || len(status.Credentials) == 0 {
		t.Fatalf("before: %+v, %v", status, err)
	}

	started, err := reader.StartService("tool.demo")
	if err != nil {
		t.Fatal(err)
	}

	if started.State != contract.ServiceRunning || started.Unit != "demo" || started.Credentials != nil {
		t.Fatalf("after start: %+v", started)
	}

	stopped, err := reader.StopService("tool.demo")
	if err != nil || stopped.State != contract.ServiceStopped {
		t.Fatalf("after stop: %+v, %v", stopped, err)
	}
}

// The default tail is the one a project's journal answers with, and a follow asks journalctl itself to keep the line open.
func TestTheJournalIsReadWithTheDefaultTailAndFollowedByJournalctl(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Units["demo"] = modtest.UnitActive
	fake.Answer("journalctl", "demo: ready\n")

	reader := state.FromEngine(serviceEngine(t, fake), state.Options{Follow: state.FollowOptions{Limit: time.Minute}})

	if _, err := reader.ServiceLogs("tool.demo", 0); err != nil {
		t.Fatal(err)
	}

	var got []string
	if err := reader.FollowService(context.Background(), "tool.demo", 3, func(line string) { got = append(got, line) }); err != nil {
		t.Fatal(err)
	}

	var journal []string
	for _, command := range fake.Commands() {
		if strings.HasPrefix(command, "journalctl") {
			journal = append(journal, command)
		}
	}

	if strings.Join(journal, " | ") != "journalctl -u demo -n 120 --no-pager -o cat | journalctl -u demo -n 3 --no-pager -o cat -f" {
		t.Fatalf("journal asked as %v", journal)
	}

	if strings.Join(got, "") != "demo: ready" {
		t.Fatalf("followed lines = %v", got)
	}
}
