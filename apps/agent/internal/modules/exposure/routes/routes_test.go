package routes_test

import (
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure/routes"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys/env"
)

const domain = "flyleaf.dev"

func shop() registry.Project {
	return registry.Project{
		Name: "shop", Dir: "shop",
		Processes: []registry.Process{
			{
				ID: "shop", Dir: registry.RootDir, PkgMgr: "bun", Host: "127.0.0.1", Port: 3100, Cmd: "bunx turbo run dev",
				Routes: []registry.Route{
					{Label: "web", Port: 3100, Hostname: "shop." + domain},
					{Label: "api", Port: 3101, Hostname: "api-shop." + domain},
					{Label: "docs", Port: 3102},
				},
			},
			{
				ID: "mail", Dir: "apps/mail", PkgMgr: "bun", Host: "mail.localhost", Port: 3105, Cmd: "bun run dev",
				Routes: []registry.Route{{Label: "mail", Port: 3105, Hostname: "mail-shop." + domain}},
			},
		},
	}
}

func TestForEmitsOneRoutePerPublishedPort(t *testing.T) {
	plain := registry.Project{Name: "plain", Dir: "plain", Processes: []registry.Process{{ID: "plain", Port: 4000, Host: "127.0.0.1"}}}
	list := routes.For(domain, []registry.Project{shop(), plain})

	want := []routes.Route{
		{Hostname: "shop." + domain, Service: "http://127.0.0.1:3100", Project: "shop"},
		{Hostname: "api-shop." + domain, Service: "http://127.0.0.1:3101", Project: "shop"},
		{Hostname: "mail-shop." + domain, Service: "http://mail.localhost:3105", Project: "shop"},
	}

	if len(list) != len(want) {
		t.Fatalf("routes = %+v, want %+v", list, want)
	}

	for at := range want {
		if list[at] != want[at] {
			t.Fatalf("route %d = %+v, want %+v", at, list[at], want[at])
		}
	}
}

func TestForKeepsToTheDomainOfTheMachine(t *testing.T) {
	if list := routes.For("", []registry.Project{shop()}); len(list) != 0 {
		t.Fatalf("without a domain there is nothing to route: %+v", list)
	}

	if list := routes.For("other.example", []registry.Project{shop()}); len(list) != 0 {
		t.Fatalf("a name under another domain is not routed: %+v", list)
	}
}

func TestMoveDomainTakesTheProjectsLock(t *testing.T) {
	lockPath := filepath.Join(t.TempDir(), "projects.lock")
	fake := modtest.NewFakeSys()
	fake.Files[env.Path] = []byte(env.DomainKey + "=old.example\n")
	fake.Files[registry.DefaultLocal] = []byte(`{"projects":[{"name":"shop","dir":"shop","processes":[{"id":"shop","pkgmgr":"bun","host":"127.0.0.1","port":3100,"routes":[{"label":"web","port":3100,"hostname":"shop.old.example"}],"cmd":"bun run dev"}]}]}`)
	ctx := modules.NewContext(modules.ContextOptions{Sys: fake, Manifest: contract.Manifest{ID: "exposure.caddy"}, ProjectsLockPath: lockPath})

	held, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		t.Fatal(err)
	}

	if err := syscall.Flock(int(held.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Fatal(err)
	}

	released := make(chan struct{})

	go func() {
		time.Sleep(200 * time.Millisecond)
		syscall.Flock(int(held.Fd()), syscall.LOCK_UN)
		held.Close()
		close(released)
	}()

	moved, err := routes.MoveDomain(ctx, "new.example")
	<-released
	if err != nil || len(moved) != 1 || moved[0] != "shop.old.example" {
		t.Fatalf("moved = %v, %v: the move must wait for the holder, then go", moved, err)
	}

	if !strings.Contains(string(fake.Files[registry.DefaultLocal]), "shop.new.example") {
		t.Fatalf("registry = %s", fake.Files[registry.DefaultLocal])
	}

	free := modules.NewContext(modules.ContextOptions{Sys: fake, Manifest: contract.Manifest{ID: "exposure.caddy"}})
	if _, err := routes.MoveDomain(free, "other.example"); err != nil {
		t.Fatalf("no lock path is no lock, as the tests take it: %v", err)
	}
}
