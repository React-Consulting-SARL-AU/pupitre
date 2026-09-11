package state_test

import (
	"errors"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/state"
	"pupitre.studio/agent/internal/sys/env"
)

const domain = "flymate.dev"

func published(t *testing.T) (*modtest.FakeSys, *state.Reader) {
	t.Helper()

	fake, reader := fixture(t)
	fake.Files[env.Path] = []byte(env.DomainKey + "=" + domain + "\n")

	return fake, reader
}

func turbo() registry.Project {
	return registry.Project{Name: "shop", Dir: "shop", PkgMgr: "bun", Host: "127.0.0.1", Port: 3100, Cmd: "bun run turbo run dev"}
}

func request(label string, port int, subdomain string) registry.RouteRequest {
	return registry.RouteRequest{Label: label, Port: port, Subdomain: subdomain}
}

func TestAddResolvesEachNameOnTheWebOnceFromTheDomain(t *testing.T) {
	fake, reader := published(t)

	added, err := reader.Add(turbo(), []registry.RouteRequest{request("web", 3100, "shop"), request("api", 3101, "api-shop"), request("docs", 3102, "")})
	if err != nil {
		t.Fatal(err)
	}

	if err := contract.ValidateValue("ProjectAddResult", added); err != nil {
		t.Fatalf("the answer violates the contract: %v", err)
	}

	want := []contract.Route{{Label: "web", Port: 3100, Hostname: "shop." + domain}, {Label: "api", Port: 3101, Hostname: "api-shop." + domain}, {Label: "docs", Port: 3102}}
	if len(added.Routes) != len(want) {
		t.Fatalf("routes = %+v", added.Routes)
	}
	for at := range want {
		if added.Routes[at] != want[at] {
			t.Fatalf("route %d = %+v, want %+v", at, added.Routes[at], want[at])
		}
	}

	if added.URL != "https://shop."+domain {
		t.Fatalf("the address is the hostname of the main port's route: %s", added.URL)
	}

	local := string(fake.Files[registry.DefaultLocal])
	if !strings.Contains(local, `"hostname": "api-shop.flymate.dev"`) {
		t.Fatalf("the hostname must be stored whole:\n%s", local)
	}
}

// The name stored when the project was declared is the one that answers: a domain that moved since does not rewrite it.
func TestTheAddressComesFromTheStoredHostnameNotFromTheDomainOfTheDay(t *testing.T) {
	fake, reader := published(t)

	if _, err := reader.Add(turbo(), []registry.RouteRequest{request("web", 3100, "shop")}); err != nil {
		t.Fatal(err)
	}

	fake.Files[env.Path] = []byte(env.DomainKey + "=other.example\n")

	address, err := reader.URL("shop")
	if err != nil {
		t.Fatal(err)
	}
	if address != "https://shop."+domain {
		t.Fatalf("got %s", address)
	}

	if got := projectOf(t, reader.Snapshot().Projects, "shop"); got.URL != "https://shop."+domain {
		t.Fatalf("the snapshot reads the same stored name: %s", got.URL)
	}
}

func TestAddRefusesASubdomainWhenTheMachineHasNoDomain(t *testing.T) {
	fake, reader := fixture(t)

	_, err := reader.Add(turbo(), []registry.RouteRequest{request("web", 3100, "shop")})
	if err == nil {
		t.Fatal("no domain, no name on the web")
	}

	if failure := protocolErr(t, err); failure.Fix == "" || !strings.Contains(failure.Message, "shop") {
		t.Fatalf("the refusal must name the subdomain and say what to do: %+v", failure)
	}

	if _, written := fake.Files[registry.DefaultLocal]; written {
		t.Fatal("a refused project must not be written")
	}
}

func TestUpdateReplacesTheRoutesWithoutRestartingTheProject(t *testing.T) {
	fake, reader := published(t)
	fake.Serves("shop", 3100)

	if _, err := reader.Add(turbo(), []registry.RouteRequest{request("web", 3100, "shop"), request("api", 3101, "api-shop")}); err != nil {
		t.Fatal(err)
	}
	if _, err := reader.Up("shop"); err != nil {
		t.Fatal(err)
	}
	before := len(fake.Mutations)

	routes := []registry.RouteRequest{request("web", 3100, "boutique"), request("docs", 3102, "")}
	updated, err := reader.Update("shop", state.UpdatePatch{Routes: &routes})
	if err != nil {
		t.Fatal(err)
	}

	if err := contract.ValidateValue("ProjectUpdateResult", updated); err != nil {
		t.Fatalf("the answer violates the contract: %v", err)
	}
	if len(updated.Routes) != 2 || updated.Routes[0].Hostname != "boutique."+domain || updated.Routes[1].Hostname != "" {
		t.Fatalf("the list is replaced, and the api route is gone: %+v", updated.Routes)
	}
	if updated.URL != "https://boutique."+domain || updated.State != contract.ProjectOnline {
		t.Fatalf("the address follows the new name and the project keeps running: %+v", updated)
	}

	for _, mutation := range fake.Mutations[before:] {
		if strings.HasPrefix(mutation, "tmux kill-window") || strings.HasPrefix(mutation, "tmux new-window") {
			t.Fatalf("a route changes nothing of what runs: %v", fake.Mutations[before:])
		}
	}

	if got := projectOf(t, reader.Snapshot().Projects, "shop"); len(got.Routes) != 2 || got.Routes[0].Label != "web" {
		t.Fatalf("the snapshot reads the new routes: %+v", got.Routes)
	}
}

func TestUpdateRestartsTheProjectOnlyWhenItsCommandChangedAndItWasRunning(t *testing.T) {
	fake, reader := published(t)
	fake.Serves("shop", 3100)

	if _, err := reader.Add(turbo(), nil); err != nil {
		t.Fatal(err)
	}

	cmd := "bun run dev --port 3100"
	stopped, err := reader.Update("shop", state.UpdatePatch{Cmd: &cmd})
	if err != nil {
		t.Fatal(err)
	}
	if stopped.State != contract.ProjectStopped || stopped.Cmd != cmd {
		t.Fatalf("a stopped project takes its new command and stays stopped: %+v", stopped)
	}

	if _, err := reader.Up("shop"); err != nil {
		t.Fatal(err)
	}
	before := len(fake.Mutations)

	again := "bun run dev --host 127.0.0.1 --port 3100"
	restarted, err := reader.Update("shop", state.UpdatePatch{Cmd: &again})
	if err != nil {
		t.Fatal(err)
	}
	if restarted.State != contract.ProjectOnline {
		t.Fatalf("the project comes back online on its new command: %+v", restarted)
	}

	mutations := strings.Join(fake.Mutations[before:], "\n")
	if !strings.Contains(mutations, "tmux kill-window shop") || !strings.Contains(mutations, "tmux new-window shop") {
		t.Fatalf("a changed command restarts the window: %v", fake.Mutations[before:])
	}

	before = len(fake.Mutations)
	branch := "release/2.0"
	if _, err := reader.Update("shop", state.UpdatePatch{Branch: &branch}); err != nil {
		t.Fatal(err)
	}
	for _, mutation := range fake.Mutations[before:] {
		if strings.HasPrefix(mutation, "tmux") {
			t.Fatalf("a branch changes nothing of what runs: %v", fake.Mutations[before:])
		}
	}
}

func TestUpdateRefusesAnUnknownProjectAndAForeignHostname(t *testing.T) {
	_, reader := published(t)

	if _, err := reader.Update("ghost", state.UpdatePatch{}); code(t, err) != contract.ErrorProjectNotFound {
		t.Fatalf("got %v", err)
	}

	if _, err := reader.Add(turbo(), nil); err != nil {
		t.Fatal(err)
	}

	foreign := []registry.RouteRequest{{Label: "web", Port: 3100, Hostname: "shop.elsewhere.org"}}
	_, err := reader.Update("shop", state.UpdatePatch{Routes: &foreign})
	if err == nil {
		t.Fatal("a hostname outside the server's domain must be refused")
	}
	if failure := protocolErr(t, err); failure.Fix == "" || !strings.Contains(failure.Fix, domain) {
		t.Fatalf("the fix must name the domain to use: %+v", failure)
	}
}

func protocolErr(t *testing.T, err error) *protocol.Error {
	t.Helper()

	var failure *protocol.Error
	if !errors.As(err, &failure) {
		t.Fatalf("expected a protocol error, got %v", err)
	}

	return failure
}
