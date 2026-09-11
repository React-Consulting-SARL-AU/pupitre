package exposure

import (
	"errors"
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure/caddy"
	"pupitre.studio/agent/internal/modules/exposure/cloudflare"
	"pupitre.studio/agent/internal/modules/exposure/cloudflared"
	"pupitre.studio/agent/internal/modules/exposure/routes"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
)

// A status read while another process installs is still a status: the app must never be told the tunnel is absent because the lock was busy.
func TestStatusAnswersWhileTheInstallLockIsHeld(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Packages["cloudflared"] = "2026.9.1"
	fake.Files[routes.ModePath] = []byte("cloudflare\n")
	fake.Files[cloudflared.UnitPath] = []byte("[Unit]\n")
	fake.Units[cloudflared.Unit] = modtest.UnitActive

	registry := modules.NewRegistry()
	registry.Register(cloudflare.Module{})
	registry.Register(caddy.Module{})

	dir := t.TempDir()
	engine := &modules.Engine{
		Registry:    registry,
		Sys:         fake,
		Now:         modtest.NewClock(10 * time.Millisecond).Now,
		Entitlement: func() contract.Entitlement { return contract.EntitlementDev },
		ReportPath:  filepath.Join(dir, "report.json"),
		LogPath:     filepath.Join(dir, "pupitre.log"),
		InstallPath: "/etc/pupitre/install.json",
		LockPath:    filepath.Join(dir, "install.lock"),
	}

	held, err := os.OpenFile(engine.LockPath, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	defer held.Close()
	if err := syscall.Flock(int(held.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Fatal(err)
	}

	answer, err := status(engine)(&protocol.Context{}, nil)
	if err != nil {
		t.Fatal(err)
	}

	report := answer.(routes.Report)
	if !report.Installed || report.Provider == nil || *report.Provider != cloudflare.Provider || report.State != routes.StateRunning {
		t.Fatalf("report = %+v: a held lock must not read as absent", report)
	}

	var refusal *protocol.Error
	if _, err := acting(engine, func(p provider) reporter { return p.sync })(&protocol.Context{}, nil); !errors.As(err, &refusal) || refusal.Code != contract.ErrorBusy {
		t.Fatalf("a sync under a held lock got %v, want busy", err)
	}
}
