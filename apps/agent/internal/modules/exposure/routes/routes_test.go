package routes_test

import (
	"testing"

	"pupitre.studio/agent/internal/modules/exposure/routes"
	"pupitre.studio/agent/internal/registry"
)

const domain = "flymate.dev"

func shop() registry.Project {
	return registry.Project{
		Name: "shop", Dir: "shop", PkgMgr: "bun", Host: "127.0.0.1", Port: 3100, Cmd: "bunx turbo run dev",
		Routes: []registry.Route{
			{Label: "web", Port: 3100, Hostname: "shop." + domain},
			{Label: "api", Port: 3101, Hostname: "api-shop." + domain},
			{Label: "docs", Port: 3102},
		},
	}
}

// One route per port that carries a name on the web, each pointing at its own port of the same project.
func TestForEmitsOneRoutePerPublishedPort(t *testing.T) {
	list := routes.For(domain, []registry.Project{shop(), {Name: "plain", Port: 4000, Host: "127.0.0.1"}})

	want := []routes.Route{
		{Hostname: "shop." + domain, Service: "http://127.0.0.1:3100", Project: "shop"},
		{Hostname: "api-shop." + domain, Service: "http://127.0.0.1:3101", Project: "shop"},
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

// A name stored under a domain the machine no longer publishes is not handed to the tunnel: it would never answer there.
func TestForKeepsToTheDomainOfTheMachine(t *testing.T) {
	if list := routes.For("", []registry.Project{shop()}); len(list) != 0 {
		t.Fatalf("without a domain there is nothing to route: %+v", list)
	}

	if list := routes.For("other.example", []registry.Project{shop()}); len(list) != 0 {
		t.Fatalf("a name under another domain is not routed: %+v", list)
	}
}
