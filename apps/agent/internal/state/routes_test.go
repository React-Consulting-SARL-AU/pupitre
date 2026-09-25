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

const domain = "flyleaf.dev"

func published(t *testing.T) (*modtest.FakeSys, *state.Reader) {
	t.Helper()

	fake, reader := fixture(t)
	fake.Files[env.Path] = []byte(env.DomainKey + "=" + domain + "\n")

	return fake, reader
}

func turbo() registry.Project {
	return registry.Project{Name: "shop", Dir: "shop"}
}

func running(cmd string, routes ...registry.RouteRequest) []state.ProcessRequest {
	if routes == nil {
		routes = []registry.RouteRequest{}
	}

	return []state.ProcessRequest{{ID: "shop", Dir: registry.RootDir, PkgMgr: "bun", Host: "127.0.0.1", Port: 3100, Cmd: cmd, Routes: routes}}
}

func request(label string, port int, subdomain string) registry.RouteRequest {
	return registry.RouteRequest{Label: label, Port: port, Subdomain: subdomain}
}

func TestAddResolvesEachNameOnTheWebOnceFromTheDomain(t *testing.T) {
	fake, reader := published(t)

	added, err := reader.Add(turbo(), running("bun run turbo run dev", request("web", 3100, "shop"), request("api", 3101, "api-shop"), request("docs", 3102, "")))
	if err != nil {
		t.Fatal(err)
	}

	if err := contract.ValidateValue("ProjectAddResult", added); err != nil {
		t.Fatalf("the answer violates the contract: %v", err)
	}

	routes := processOf(t, added.Project, "shop").Routes
	want := []contract.Route{{Label: "web", Port: 3100, Hostname: "shop." + domain}, {Label: "api", Port: 3101, Hostname: "api-shop." + domain}, {Label: "docs", Port: 3102}}
	if len(routes) != len(want) {
		t.Fatalf("routes = %+v", routes)
	}
	for at := range want {
		if routes[at] != want[at] {
			t.Fatalf("route %d = %+v, want %+v", at, routes[at], want[at])
		}
	}

	if added.URL != "https://shop."+domain || processOf(t, added.Project, "shop").URL != added.URL {
		t.Fatalf("the address is the hostname of the main port's route: %s", added.URL)
	}

	local := string(fake.Files[registry.DefaultLocal])
	if !strings.Contains(local, `"hostname": "api-shop.flyleaf.dev"`) {
		t.Fatalf("the hostname must be stored whole:\n%s", local)
	}
}

func TestTheAddressComesFromTheStoredHostnameNotFromTheDomainOfTheDay(t *testing.T) {
	fake, reader := published(t)

	if _, err := reader.Add(turbo(), running("bun run turbo run dev", request("web", 3100, "shop"))); err != nil {
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

	_, err := reader.Add(turbo(), running("bun run turbo run dev", request("web", 3100, "shop")))
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
	fake.Serves("shop/shop", 3100)

	if _, err := reader.Add(turbo(), running("bun run turbo run dev", request("web", 3100, "shop"), request("api", 3101, "api-shop"))); err != nil {
		t.Fatal(err)
	}
	if _, err := reader.Up("shop", ""); err != nil {
		t.Fatal(err)
	}
	before := len(fake.Mutations)

	processes := running("bun run turbo run dev", request("web", 3100, "boutique"), request("docs", 3102, ""))
	updated, err := reader.Update("shop", state.UpdatePatch{Processes: &processes})
	if err != nil {
		t.Fatal(err)
	}

	if err := contract.ValidateValue("ProjectUpdateResult", updated); err != nil {
		t.Fatalf("the answer violates the contract: %v", err)
	}
	routes := processOf(t, updated.Project, "shop").Routes
	if len(routes) != 2 || routes[0].Hostname != "boutique."+domain || routes[1].Hostname != "" {
		t.Fatalf("the list is replaced, and the api route is gone: %+v", routes)
	}
	if updated.URL != "https://boutique."+domain || updated.State != contract.ProjectOnline {
		t.Fatalf("the address follows the new name and the project keeps running: %+v", updated)
	}

	for _, mutation := range fake.Mutations[before:] {
		if strings.HasPrefix(mutation, "tmux kill-window") || strings.HasPrefix(mutation, "tmux new-window") {
			t.Fatalf("a route changes nothing of what runs: %v", fake.Mutations[before:])
		}
	}

	if got := processOf(t, projectOf(t, reader.Snapshot().Projects, "shop"), "shop"); len(got.Routes) != 2 || got.Routes[0].Label != "web" {
		t.Fatalf("the snapshot reads the new routes: %+v", got.Routes)
	}
}

func TestUpdateRestartsTheProcessOnlyWhenItsCommandChangedAndItWasRunning(t *testing.T) {
	fake, reader := published(t)
	fake.Serves("shop/shop", 3100)

	if _, err := reader.Add(turbo(), running("bun run turbo run dev")); err != nil {
		t.Fatal(err)
	}

	cmd := "bun run dev --port 3100"
	processes := running(cmd)
	stopped, err := reader.Update("shop", state.UpdatePatch{Processes: &processes})
	if err != nil {
		t.Fatal(err)
	}
	if stopped.State != contract.ProjectStopped || processOf(t, stopped.Project, "shop").Cmd != cmd {
		t.Fatalf("a stopped project takes its new command and stays stopped: %+v", stopped)
	}

	if _, err := reader.Up("shop", ""); err != nil {
		t.Fatal(err)
	}
	before := len(fake.Mutations)

	processes = running("bun run dev --host 127.0.0.1 --port 3100")
	restarted, err := reader.Update("shop", state.UpdatePatch{Processes: &processes})
	if err != nil {
		t.Fatal(err)
	}
	if restarted.State != contract.ProjectOnline {
		t.Fatalf("the project comes back online on its new command: %+v", restarted)
	}

	mutations := strings.Join(fake.Mutations[before:], "\n")
	if !strings.Contains(mutations, "tmux kill-window shop/shop") || !strings.Contains(mutations, "tmux new-window shop/shop") {
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

func TestUpdateStartsNothingForANewProcessAndStopsAProcessThatLeaves(t *testing.T) {
	fake, reader := published(t)
	fake.Serves("shop/shop", 3100)
	fake.Serves("shop/mail", 3105)
	fake.Dirs["/home/dev/projects/shop/apps/mail"] = true

	if _, err := reader.Add(turbo(), running("bun run turbo run dev")); err != nil {
		t.Fatal(err)
	}
	if _, err := reader.Up("shop", ""); err != nil {
		t.Fatal(err)
	}

	mail := state.ProcessRequest{ID: "mail", Dir: "apps/mail", PkgMgr: "bun", Host: "127.0.0.1", Port: 3105, Cmd: "bun run dev --port 3105"}
	both := append(running("bun run turbo run dev"), mail)
	before := len(fake.Mutations)

	updated, err := reader.Update("shop", state.UpdatePatch{Processes: &both})
	if err != nil {
		t.Fatal(err)
	}
	if updated.State != contract.ProjectPartial || processOf(t, updated.Project, "mail").State != contract.ProcessStopped || processOf(t, updated.Project, "shop").State != contract.ProcessOnline {
		t.Fatalf("the new process is declared, not started, and the project is partial: %+v", updated)
	}
	for _, mutation := range fake.Mutations[before:] {
		if strings.HasPrefix(mutation, "tmux") {
			t.Fatalf("declaring a process touches nothing that runs: %v", fake.Mutations[before:])
		}
	}

	if _, err := reader.Up("shop", "mail"); err != nil {
		t.Fatal(err)
	}
	if got := projectOf(t, reader.Snapshot().Projects, "shop"); got.State != contract.ProjectOnline {
		t.Fatalf("both processes up is online: %+v", got)
	}

	only := running("bun run turbo run dev")
	updated, err = reader.Update("shop", state.UpdatePatch{Processes: &only})
	if err != nil {
		t.Fatal(err)
	}
	if _, open := fake.Windows["shop/mail"]; open || len(updated.Processes) != 1 || updated.State != contract.ProjectOnline {
		t.Fatalf("a process that leaves the list is stopped: %+v", updated)
	}
}

func TestUpdateRefusesAnUnknownProjectAndAForeignHostname(t *testing.T) {
	_, reader := published(t)

	if _, err := reader.Update("ghost", state.UpdatePatch{}); code(t, err) != contract.ErrorProjectNotFound {
		t.Fatalf("got %v", err)
	}

	if _, err := reader.Add(turbo(), running("bun run turbo run dev")); err != nil {
		t.Fatal(err)
	}

	foreign := running("bun run turbo run dev", registry.RouteRequest{Label: "web", Port: 3100, Hostname: "shop.elsewhere.org"})
	_, err := reader.Update("shop", state.UpdatePatch{Processes: &foreign})
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
