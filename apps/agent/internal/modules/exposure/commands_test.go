package exposure

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/gate"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure/caddy"
	"pupitre.studio/agent/internal/modules/exposure/cloudflare"
	"pupitre.studio/agent/internal/modules/exposure/cloudflared"
	"pupitre.studio/agent/internal/modules/exposure/gateway"
	"pupitre.studio/agent/internal/modules/exposure/routes"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys/env"
)

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
		License:     func() contract.License { return contract.LicenseDev },
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

func TestAStatusThatCannotBeReadIsAnErrorNotAnAbsence(t *testing.T) {
	registry := modules.NewRegistry()
	registry.Register(cloudflare.Module{})
	registry.Register(caddy.Module{})

	dir := t.TempDir()
	engine := &modules.Engine{
		Registry:    registry,
		Sys:         modtest.NewFakeSys(),
		Now:         modtest.NewClock(10 * time.Millisecond).Now,
		License:     func() contract.License { return contract.LicenseDev },
		ReportPath:  filepath.Join(dir, "report.json"),
		LogPath:     filepath.Join(dir, "pupitre.log"),
		InstallPath: "/etc/pupitre/install.json",
		LockPath:    filepath.Join(dir, "install.lock"),
	}

	unreadable := errors.New("module.config: permission denied")
	kept := providers
	providers = []provider{{id: cloudflare.ID, status: func(*modules.Context) (routes.Report, error) { return routes.Report{}, unreadable }}}
	defer func() { providers = kept }()

	if _, err := status(engine)(&protocol.Context{}, nil); !errors.Is(err, unreadable) {
		t.Fatalf("status = %v, want the read error", err)
	}

	if _, err := acting(engine, func(p provider) reporter { return p.sync })(&protocol.Context{}, nil); !errors.Is(err, unreadable) {
		t.Fatalf("sync = %v, want the read error", err)
	}
}

func TestSettlePutsTheGateInFrontOfATunnelFromBeforeIt(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Packages["cloudflared"] = "2026.9.1"
	fake.Files[routes.ModePath] = []byte("cloudflare\n")
	fake.Files[cloudflared.UnitPath] = cloudflared.UnitFile
	fake.Units[cloudflared.Unit] = modtest.UnitActive
	fake.Files[env.Path] = []byte(env.DomainKey + "=example.org\n")
	fake.Files[cloudflared.CredentialsPath] = cloudflared.Credentials{
		AccountTag: "0123456789abcdef0123456789abcdef", TunnelID: "01234567-89ab-cdef-0123-456789abcdef", TunnelSecret: "c2VjcmV0",
	}.Encode()
	fake.Files[cloudflared.ConfigPath] = []byte("ingress:\n  - hostname: shop.example.org\n    service: http://127.0.0.1:3100\n  - service: http_status:404\n")
	fake.Files[registry.DefaultLocal] = []byte(`{"projects":[{"name":"shop","dir":"shop","protected":true,"processes":[{"id":"shop","pkgmgr":"bun","host":"127.0.0.1","port":3100,"routes":[{"label":"web","port":3100,"hostname":"shop.example.org"}],"cmd":"bun run dev"}]}]}`)

	reg := modules.NewRegistry()
	reg.Register(cloudflare.Module{})
	reg.Register(caddy.Module{})

	dir := t.TempDir()
	engine := &modules.Engine{
		Registry:    reg,
		Sys:         fake,
		Now:         modtest.NewClock(10 * time.Millisecond).Now,
		License:     func() contract.License { return contract.LicenseDev },
		ReportPath:  filepath.Join(dir, "report.json"),
		LogPath:     filepath.Join(dir, "pupitre.log"),
		InstallPath: "/etc/pupitre/install.json",
		LockPath:    filepath.Join(dir, "install.lock"),
	}

	if err := Settle(engine); err != nil {
		t.Fatalf("Settle: %v", err)
	}

	if _, unit := fake.Files[gateway.UnitPath]; !unit {
		t.Fatal("an updated agent must install the gate without waiting for a gesture")
	}

	if ingress := string(fake.Files[cloudflared.ConfigPath]); !strings.Contains(ingress, "service: http://"+gate.Address) || strings.Contains(ingress, "127.0.0.1:3100") {
		t.Fatalf("the ingress must send every name to the gate:\n%s", ingress)
	}

	if gated := string(fake.Files[gate.RoutesPath]); !strings.Contains(gated, `"protected": true`) {
		t.Fatalf("routes = %s", gated)
	}

	fake.Mutations = nil

	if err := Settle(engine); err != nil {
		t.Fatalf("second Settle: %v", err)
	}

	if len(fake.Mutations) != 0 {
		t.Fatalf("a gate in place must cost a session nothing: %v", fake.Mutations)
	}
}

func TestSettleLeavesAMachineWithoutExposureAlone(t *testing.T) {
	reg := modules.NewRegistry()
	reg.Register(cloudflare.Module{})
	reg.Register(caddy.Module{})

	fake := modtest.NewFakeSys()
	dir := t.TempDir()
	engine := &modules.Engine{
		Registry:    reg,
		Sys:         fake,
		Now:         modtest.NewClock(10 * time.Millisecond).Now,
		License:     func() contract.License { return contract.LicenseDev },
		ReportPath:  filepath.Join(dir, "report.json"),
		LogPath:     filepath.Join(dir, "pupitre.log"),
		InstallPath: "/etc/pupitre/install.json",
		LockPath:    filepath.Join(dir, "install.lock"),
	}

	if err := Settle(engine); err != nil {
		t.Fatalf("Settle: %v", err)
	}

	if len(fake.Mutations) != 0 {
		t.Fatalf("nothing to settle, yet: %v", fake.Mutations)
	}
}

func TestAResyncReachesTheExposureThatIsThere(t *testing.T) {
	kept := providers
	defer func() { providers = kept }()

	synced := ""
	providers = []provider{
		{id: caddy.ID, status: func(*modules.Context) (routes.Report, error) { return routes.Report{}, nil }},
		{id: cloudflare.ID, status: func(*modules.Context) (routes.Report, error) { return routes.Report{Installed: true}, nil }, sync: func(ctx *modules.Context) (routes.Report, error) {
			synced = ctx.Module()

			return routes.Report{}, nil
		}},
	}

	contexts := func(id string) (*modules.Context, bool) {
		return modtest.NewContext(t, modtest.NewFakeSys(), modtest.Options{Module: id}), true
	}

	if found, err := Resync(contexts); !found || err != nil || synced != cloudflare.ID {
		t.Fatalf("found %v, %v, synced %q", found, err, synced)
	}

	providers = providers[:1]
	if found, err := Resync(contexts); found || err != nil {
		t.Fatalf("nothing to sync: found %v, %v", found, err)
	}
}
