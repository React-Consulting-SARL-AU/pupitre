package registry_test

import (
	"errors"
	"fmt"
	"os"
	"reflect"
	"strconv"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/env"
)

func fixture(t *testing.T, name string) []byte {
	t.Helper()

	raw, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatal(err)
	}

	return raw
}

const domain = "flymate.dev"

func loaded(t *testing.T) (*modtest.FakeSys, *registry.File) {
	t.Helper()

	fake := modtest.NewFakeSys()
	fake.Files[registry.DefaultConf] = fixture(t, "projects.conf")
	fake.Files[registry.DefaultLocal] = fixture(t, "projects.local.json")
	fake.Files[env.Path] = []byte(env.DomainKey + "=" + domain + "\n")

	return fake, registry.Load(context(fake), registry.Paths{})
}

func reload(fake *modtest.FakeSys) *registry.File {
	return registry.Load(context(fake), registry.Paths{})
}

func route(label string, port int, hostname string) registry.Route {
	return registry.Route{Label: label, Port: port, Hostname: hostname}
}

// One line of /proc/net/tcp with a socket listening on that port, as the kernel writes it.
func listening(ports ...int) []byte {
	var table strings.Builder
	table.WriteString("  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n")
	for at, port := range ports {
		fmt.Fprintf(&table, "   %d: 0100007F:%04X 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 %d 1 0000 100 0 0 10 0\n", at, port, 12345+at)
	}

	return []byte(table.String())
}

func context(fake *modtest.FakeSys) sys.Context {
	return modtest.NewSysContext(fake)
}

func TestLoadReadsTheRepositoryRegistry(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[registry.DefaultConf] = fixture(t, "projects.conf")

	file := registry.Load(context(fake), registry.Paths{})

	if len(file.Projects) != 2 {
		t.Fatalf("got %d projects, want the two uncommented rows: %+v", len(file.Projects), file.Projects)
	}

	shots := file.Projects[1]
	if shots.Name != "shots" || shots.PkgMgr != "service" || shots.Port != 8099 {
		t.Fatalf("unexpected row: %+v", shots)
	}
	if shots.Cmd != "-" || shots.Install != "-" {
		t.Fatalf("the nine columns must be kept verbatim: %+v", shots)
	}
	if len(shots.Routes) != 1 || shots.Routes[0].Label != "shots" || shots.Routes[0].Port != 8099 || shots.Routes[0].Hostname != "" {
		t.Fatalf("a subdomain of the repository's file is a route, without a hostname while the machine has no domain: %+v", shots.Routes)
	}
}

// The seventh column of the repository's file is a subdomain by its own specification: it is completed with the domain the machine publishes under, at each reading.
func TestTheRepositoryRegistryTakesTheDomainOfTheMachine(t *testing.T) {
	_, file := loaded(t)

	shots, _ := file.Get("shots")
	if len(shots.Routes) != 1 || shots.Routes[0].Hostname != "shots."+domain {
		t.Fatalf("unexpected route: %+v", shots.Routes)
	}
	if got := shots.Contract(registry.ProjectsDir).Routes; len(got) != 1 || got[0].Hostname != "shots."+domain {
		t.Fatalf("the contract must carry the route: %+v", got)
	}
}

func TestLocalRowsWinOnEqualNames(t *testing.T) {
	_, file := loaded(t)

	web, ok := file.Get("web")
	if !ok {
		t.Fatal("web must come from the local file")
	}
	if !web.Local {
		t.Fatal("a row of the local file is local")
	}

	api, ok := file.Get("api")
	if !ok {
		t.Fatal("api is declared in both files")
	}
	if api.Port != 8081 {
		t.Fatalf("the local row wins: got port %d, want 8081", api.Port)
	}
	if !api.Local {
		t.Fatal("a shadowed row becomes local")
	}
}

func TestOrderFollowsFirstAppearance(t *testing.T) {
	_, file := loaded(t)

	var names []string
	for _, project := range file.Projects {
		names = append(names, project.Name)
	}

	want := "api shots web mail scratch"
	if strings.Join(names, " ") != want {
		t.Fatalf("got %q, want %q", strings.Join(names, " "), want)
	}
}

func TestPortKeepsOnlyItsNumber(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[registry.DefaultConf] = []byte("mail|web/apps/mail|-|pnpm|127.0.0.1|https:5180|mail|pnpm run dev --port 5180\n")

	mail, _ := registry.Load(context(fake), registry.Paths{}).Get("mail")
	if mail.Port != 5180 {
		t.Fatalf("https:5180 must read as 5180, got %d", mail.Port)
	}
}

func TestTheLocalRegistryIsOneJSONDocument(t *testing.T) {
	_, file := loaded(t)

	web, ok := file.Get("web")
	if !ok || !web.Local || web.Repo != "https://github.com/me/web" {
		t.Fatalf("unexpected row: %+v", web)
	}
	if len(web.Routes) != 2 || web.Routes[1] != route("admin", 3010, "admin-web."+domain) {
		t.Fatalf("every route of the document is read: %+v", web.Routes)
	}

	if _, err := registry.ParseLocal([]byte("web|web|-|bun|127.0.0.1|3000|web|bun run dev\n")); err == nil {
		t.Fatal("the local file is read as JSON, and as nothing else")
	}
}

func TestInstallCommandIsDerivedWhenTheColumnIsEmpty(t *testing.T) {
	_, file := loaded(t)

	for name, want := range map[string]string{
		"web":     "bun install",
		"api":     "./gradlew --version",
		"mail":    "pnpm install",
		"scratch": "",
		"shots":   "",
	} {
		project, ok := file.Get(name)
		if !ok {
			t.Fatalf("%s missing from the registry", name)
		}

		if got := project.InstallCommand(); got != want {
			t.Errorf("%s: got %q, want %q", name, got, want)
		}
	}
}

func TestInstallColumnWinsOverTheDerivedCommand(t *testing.T) {
	_, file := loaded(t)

	scratch, _ := file.Get("scratch")
	if scratch.Install != "" {
		t.Fatalf("scratch has no install column: %q", scratch.Install)
	}

	python, ok := file.Get("api")
	if !ok {
		t.Fatal("api missing")
	}
	python.Install = "python3 -m venv .venv"
	if got := python.InstallCommand(); got != "python3 -m venv .venv" {
		t.Fatalf("got %q", got)
	}
}

func TestAddWritesTheLocalFileOnly(t *testing.T) {
	fake, file := loaded(t)
	before := string(fake.Files[registry.DefaultConf])

	added := registry.Project{Name: "shop", Dir: "shop", Repo: "-", PkgMgr: "bun", Host: "127.0.0.1", Port: 3200, Routes: []registry.Route{route("shop", 3200, "shop."+domain)}, Cmd: "bun run dev --port 3200"}
	if err := file.Add(context(fake), added); err != nil {
		t.Fatal(err)
	}

	if string(fake.Files[registry.DefaultConf]) != before {
		t.Fatal("the repository registry must never be rewritten")
	}

	local := string(fake.Files[registry.DefaultLocal])
	if !strings.Contains(local, `"name": "shop"`) || !strings.Contains(local, `"hostname": "shop.flymate.dev"`) || strings.Contains(local, `"repo": "-"`) {
		t.Fatalf("the row must be written as JSON, its values without the dashes of the old format:\n%s", local)
	}

	reloaded := reload(fake)
	shop, ok := reloaded.Get("shop")
	if !ok || shop.Port != 3200 || !shop.Local || shop.Repo != "" || len(shop.Routes) != 1 {
		t.Fatalf("unexpected row after a reload: %+v", shop)
	}
	if _, ok := reloaded.Get("web"); !ok {
		t.Fatal("adding must not drop the other local rows")
	}
}

func TestAddRefusesADuplicatePortWithAFix(t *testing.T) {
	fake, file := loaded(t)

	err := file.Add(context(fake), registry.Project{Name: "twin", Dir: "twin", PkgMgr: "bun", Host: "127.0.0.1", Port: 3000, Cmd: "bun run dev"})
	if err == nil {
		t.Fatal("two projects on the same port must be refused")
	}

	failure := protocolError(t, err)
	if !strings.Contains(failure.Message, "3000") || !strings.Contains(failure.Message, "web") {
		t.Fatalf("the message must name the port and its holder: %s", failure.Message)
	}
	if failure.Fix == "" {
		t.Fatal("a refusal on a port must carry a fix")
	}
	if !strings.Contains(failure.Fix, "3001") {
		t.Fatalf("the fix must propose a free port: %s", failure.Fix)
	}
	if failure.Remedy == nil || failure.Remedy.Code != contract.RemedyPortTaken || failure.Remedy.PortFree != 3001 {
		t.Fatalf("the free port must travel as a number, not only in the sentence: %+v", failure.Remedy)
	}
	if _, taken := registry.Load(context(fake), registry.Paths{}).Get("twin"); taken {
		t.Fatal("a refused project must not be written")
	}
}

func TestAddRefusesADuplicateHostnameAndName(t *testing.T) {
	fake, file := loaded(t)

	err := file.Add(context(fake), registry.Project{Name: "other", Dir: "other", PkgMgr: "bun", Host: "127.0.0.1", Port: 3300, Routes: []registry.Route{route("other", 3300, "admin-web."+domain)}, Cmd: "bun run dev"})
	if err == nil {
		t.Fatal("a hostname is unique, whichever route of a project holds it")
	}
	if failure := protocolError(t, err); !strings.Contains(failure.Message, "admin-web."+domain) || !strings.Contains(failure.Message, "web") || failure.Fix == "" {
		t.Fatalf("the refusal must name the address and its holder, with a fix: %+v", failure)
	}

	if err := file.Add(context(fake), registry.Project{Name: "web", Dir: "web2", PkgMgr: "bun", Host: "127.0.0.1", Port: 3400, Cmd: "bun run dev"}); err == nil {
		t.Fatal("a name is unique")
	}
}

// The ports of every route count: a project on 3200 whose api route wants 3010 collides with the admin route of web.
func TestAddRefusesAPortHeldByARouteOfAnotherProject(t *testing.T) {
	fake, file := loaded(t)

	err := file.Add(context(fake), registry.Project{Name: "twin", Dir: "twin", PkgMgr: "bun", Host: "127.0.0.1", Port: 3200, Routes: []registry.Route{route("web", 3200, ""), route("api", 3010, "")}, Cmd: "bun run dev"})
	if err == nil {
		t.Fatal("a port held by a route is taken")
	}

	failure := protocolError(t, err)
	if !strings.Contains(failure.Message, "3010") || !strings.Contains(failure.Message, "web") {
		t.Fatalf("the message must name the port and its holder: %s", failure.Message)
	}
}

func TestAddRefusesAHostnameOutsideTheDomainAndAnInvalidOne(t *testing.T) {
	fake, file := loaded(t)

	for label, hostname := range map[string]string{
		"foreign": "shop.elsewhere.org",
		"bare":    domain,
		"invalid": "-shop." + domain,
		"one":     "shop",
	} {
		err := file.Add(context(fake), registry.Project{Name: "h-" + label, Dir: "h", PkgMgr: "bun", Host: "127.0.0.1", Port: 3900, Routes: []registry.Route{route("web", 3900, hostname)}, Cmd: "bun run dev"})
		if err == nil {
			t.Errorf("%s: %q must be refused", label, hostname)
			continue
		}

		if failure := protocolError(t, err); failure.Fix == "" {
			t.Errorf("%s: a refused hostname must carry a fix", label)
		}
	}
}

func TestAddRefusesALabelThatIsNotOneWordOrRepeats(t *testing.T) {
	fake, file := loaded(t)

	for label, routes := range map[string][]registry.Route{
		"case":      {route("Web", 3900, "")},
		"dotted":    {route("web.api", 3900, "")},
		"duplicate": {route("web", 3900, ""), route("web", 3901, "")},
	} {
		if err := file.Add(context(fake), registry.Project{Name: "l-" + label, Dir: "l", PkgMgr: "bun", Host: "127.0.0.1", Port: 3900, Routes: routes, Cmd: "bun run dev"}); err == nil {
			t.Errorf("%s: must be refused", label)
		}
	}
}

func TestResolveRoutesComposesTheHostnameOnceFromTheDomain(t *testing.T) {
	routes, err := registry.ResolveRoutes(domain, []registry.RouteRequest{
		{Label: "web", Port: 3000, Subdomain: "shop"},
		{Label: "api", Port: 3001, Subdomain: "api-shop"},
		{Label: "docs", Port: 3002},
		{Label: "admin", Port: 3003, Hostname: "admin.shop." + domain},
	})
	if err != nil {
		t.Fatal(err)
	}

	want := []registry.Route{route("web", 3000, "shop."+domain), route("api", 3001, "api-shop."+domain), route("docs", 3002, ""), route("admin", 3003, "admin.shop."+domain)}
	for at := range want {
		if routes[at] != want[at] {
			t.Fatalf("route %d = %+v, want %+v", at, routes[at], want[at])
		}
	}

	if _, err := registry.ResolveRoutes("", []registry.RouteRequest{{Label: "web", Port: 3000, Subdomain: "shop"}}); err == nil {
		t.Fatal("a subdomain on a machine without a domain must be refused")
	} else if failure := protocolError(t, err); failure.Fix == "" {
		t.Fatal("that refusal must say what to do")
	}

	if _, err := registry.ResolveRoutes(domain, []registry.RouteRequest{{Label: "web", Port: 3000, Subdomain: "shop", Hostname: "shop." + domain}}); err == nil {
		t.Fatal("a subdomain and a hostname at once must be refused")
	}
}

func TestAddRefusesInvalidFields(t *testing.T) {
	fake, file := loaded(t)

	for label, project := range map[string]registry.Project{
		"name":    {Name: "Web", Dir: "web3", PkgMgr: "bun", Host: "127.0.0.1", Port: 3500, Cmd: "bun run dev"},
		"escape":  {Name: "up", Dir: "../etc", PkgMgr: "bun", Host: "127.0.0.1", Port: 3501, Cmd: "bun run dev"},
		"absolue": {Name: "abs", Dir: "/etc", PkgMgr: "bun", Host: "127.0.0.1", Port: 3502, Cmd: "bun run dev"},
		"port":    {Name: "low", Dir: "low", PkgMgr: "bun", Host: "127.0.0.1", Port: 80, Cmd: "bun run dev"},
		"pkgmgr":  {Name: "yarny", Dir: "yarny", PkgMgr: "yarn", Host: "127.0.0.1", Port: 3503, Cmd: "yarn dev"},
		"route":   {Name: "low-route", Dir: "low", PkgMgr: "bun", Host: "127.0.0.1", Port: 3504, Routes: []registry.Route{route("web", 80, "")}, Cmd: "bun run dev"},
	} {
		if err := file.Add(context(fake), project); err == nil {
			t.Errorf("%s: must be refused", label)
		}
	}
}

func TestBranchIsWrittenAndReadBack(t *testing.T) {
	fake, file := loaded(t)

	added := registry.Project{Name: "two", Dir: "two", Repo: "https://github.com/me/two", PkgMgr: "bun", Host: "127.0.0.1", Port: 3200, Cmd: "bun run dev --port 3200", Branch: "release/2.0"}
	if err := file.Add(context(fake), added); err != nil {
		t.Fatal(err)
	}

	local := string(fake.Files[registry.DefaultLocal])
	if !strings.Contains(local, `"branch": "release/2.0"`) || strings.Contains(local, `"install"`) {
		t.Fatalf("the branch is written, and an install the manager derives is not:\n%s", local)
	}

	reloaded := reload(fake)
	two, ok := reloaded.Get("two")
	if !ok || two.Branch != "release/2.0" {
		t.Fatalf("the branch must survive a reload: %+v", two)
	}
	if two.InstallCommand() != "bun install" {
		t.Fatalf(`an absent install line still derives its command: %q`, two.InstallCommand())
	}
	if got := two.Contract(registry.ProjectsDir).Branch; got != "release/2.0" {
		t.Fatalf("the contract must carry the branch, got %q", got)
	}
}

func TestRowsOfEightAndNineColumnsAreStillProjects(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[registry.DefaultConf] = []byte(strings.Join([]string{
		"eight|eight|-|bun|127.0.0.1|3000|eight|bun run dev",
		"nine|nine|-|bun|127.0.0.1|3001|nine|bun run dev|bun install --frozen-lockfile",
		"ten|ten|-|bun|127.0.0.1|3002|ten|bun run dev|-|main",
	}, "\n"))

	file := registry.Load(context(fake), registry.Paths{})

	if len(file.Projects) != 3 {
		t.Fatalf("got %d projects, want three: %+v", len(file.Projects), file.Projects)
	}

	for name, want := range map[string]string{"eight": "", "nine": "", "ten": "main"} {
		project, ok := file.Get(name)
		if !ok {
			t.Fatalf("%s missing from the registry", name)
		}

		if project.Branch != want {
			t.Errorf("%s: got branch %q, want %q", name, project.Branch, want)
		}
	}

	nine, _ := file.Get("nine")
	if nine.InstallCommand() != "bun install --frozen-lockfile" {
		t.Fatalf("a nine-column row keeps its install command: %q", nine.InstallCommand())
	}
}

func TestResolveRoutesTakesASubdomainOfSeveralLevels(t *testing.T) {
	routes, err := registry.ResolveRoutes(domain, []registry.RouteRequest{{Label: "web", Port: 3200, Subdomain: "api.shop"}})
	if err != nil {
		t.Fatalf("a client who owns the certificate may publish under several levels: %v", err)
	}

	if routes[0].Hostname != "api.shop."+domain {
		t.Fatalf("unexpected route: %+v", routes[0])
	}
}

func TestResolveRoutesRefusesASubdomainDNSWouldNotCarry(t *testing.T) {
	port := 3600
	for _, sub := range []string{"-shop", "shop-", ".shop", "shop.", "api..shop", "Shop", "api_shop", strings.Repeat("a", registry.SubdomainMax+1)} {
		port++

		_, err := registry.ResolveRoutes(domain, []registry.RouteRequest{{Label: "sub" + strconv.Itoa(port), Port: port, Subdomain: sub}})
		if err == nil {
			t.Errorf("%q must be refused", sub)
			continue
		}

		if failure := protocolError(t, err); failure.Fix == "" {
			t.Errorf("%q: a refused subdomain must carry a fix", sub)
		}
	}
}

func TestUpdateReplacesTheRoutesAndKeepsTheRest(t *testing.T) {
	fake, file := loaded(t)

	routes := []registry.Route{route("web", 3000, "boutique."+domain), route("api", 3001, "api-boutique."+domain)}
	cmd := "turbo run dev"
	updated, err := file.Update(context(fake), "web", registry.Patch{Cmd: &cmd, Routes: &routes})
	if err != nil {
		t.Fatal(err)
	}

	if updated.Cmd != cmd || updated.Repo != "https://github.com/me/web" || updated.Port != 3000 {
		t.Fatalf("the rest of the row must stay: %+v", updated)
	}
	if len(updated.Routes) != 2 || updated.Routes[0].Hostname != "boutique."+domain {
		t.Fatalf("the list is replaced whole, not merged: %+v", updated.Routes)
	}

	web, _ := reload(fake).Get("web")
	if web.Cmd != cmd || len(web.Routes) != 2 || web.Routes[1] != routes[1] {
		t.Fatalf("the update must survive a reload: %+v", web)
	}
	if _, ok := reload(fake).Get("mail"); !ok {
		t.Fatal("the other local rows must stay")
	}
}

// A domain that changes takes every name with it: the client picks another zone, and no project may go on answering under the old one.
func TestRehostMovesEveryNameUnderTheOldDomain(t *testing.T) {
	fake, file := loaded(t)

	moved, err := file.Rehost(context(fake), domain, "flymate.studio")
	if err != nil {
		t.Fatal(err)
	}

	want := []string{"admin-web.flymate.dev", "api.flymate.dev", "mail.flymate.dev", "web.flymate.dev"}
	if !reflect.DeepEqual(moved, want) {
		t.Fatalf("moved = %v, want %v", moved, want)
	}

	if file.Domain != "flymate.studio" {
		t.Fatalf("the registry now resolves against %q", file.Domain)
	}

	web, _ := reload(fake).Get("web")
	if web.Routes[0].Hostname != "web.flymate.studio" || web.Routes[1].Hostname != "admin-web.flymate.studio" {
		t.Fatalf("the move must survive a reload: %+v", web.Routes)
	}

	again, err := file.Rehost(context(fake), "flymate.studio", "flymate.studio")
	if err != nil || len(again) != 0 {
		t.Fatalf("the same domain moves nothing: %v, %v", again, err)
	}
}

func TestUpdateDoesNotCompeteWithItself(t *testing.T) {
	fake, file := loaded(t)

	routes := []registry.Route{route("web", 3000, "web."+domain)}
	if _, err := file.Update(context(fake), "web", registry.Patch{Routes: &routes}); err != nil {
		t.Fatalf("keeping one's own port and hostname is not a collision: %v", err)
	}

	taken := []registry.Route{route("web", 3000, "mail."+domain)}
	if _, err := file.Update(context(fake), "web", registry.Patch{Routes: &taken}); err == nil {
		t.Fatal("another project's hostname is still taken")
	}

	install := ""
	if _, err := file.Update(context(fake), "shots", registry.Patch{Install: &install}); err == nil {
		t.Fatal("a row of the repository is not rewritten here")
	}

	if _, err := file.Update(context(fake), "ghost", registry.Patch{}); err == nil {
		t.Fatal("an unknown project must be refused")
	}
}

func TestAddRefusesABranchGitMustNeverSee(t *testing.T) {
	fake, file := loaded(t)

	if err := file.Add(context(fake), registry.Project{Name: "orphan", Dir: "orphan", PkgMgr: "bun", Host: "127.0.0.1", Port: 3700, Cmd: "bun run dev", Branch: "--orphan"}); err == nil {
		t.Fatal("an option must never pass for a branch name")
	}
}

func TestRemoveTakesTheLocalRowOut(t *testing.T) {
	fake, file := loaded(t)

	removed, err := file.Remove(context(fake), "web")
	if err != nil {
		t.Fatal(err)
	}
	if removed.Dir != "web" || len(removed.Hostnames()) != 2 {
		t.Fatalf("the folder and the names on the web must be reported: %+v", removed)
	}

	reloaded := reload(fake)
	if _, ok := reloaded.Get("web"); ok {
		t.Fatal("web must be gone")
	}
	if _, ok := reloaded.Get("mail"); !ok {
		t.Fatal("the other local rows must stay")
	}
}

func TestRemoveRestoresTheShadowedRow(t *testing.T) {
	fake, file := loaded(t)

	if _, err := file.Remove(context(fake), "api"); err != nil {
		t.Fatal(err)
	}

	api, ok := reload(fake).Get("api")
	if !ok {
		t.Fatal("api comes back from the repository registry")
	}
	if api.Port != 8080 || api.Local {
		t.Fatalf("the repository row must be the one left: %+v", api)
	}
}

func TestRemoveRefusesARowOfTheRepository(t *testing.T) {
	fake, file := loaded(t)

	if _, err := file.Remove(context(fake), "shots"); err == nil {
		t.Fatal("a row that only the repository declares cannot be removed here")
	}

	if _, err := file.Remove(context(fake), "ghost"); err == nil {
		t.Fatal("an unknown project must be refused")
	}
}

func TestFreePortSkipsTheRegistryAndTheListeningPorts(t *testing.T) {
	_, file := loaded(t)

	if got := file.FreePort(3000, nil); got != 3001 {
		t.Fatalf("got %d, want 3001", got)
	}

	if got := file.FreePort(3000, map[int]bool{3001: true, 3002: true}); got != 3003 {
		t.Fatalf("got %d, want 3003", got)
	}

	if got := file.FreePort(3010, nil); got != 3011 {
		t.Fatalf("the port of a route counts as taken: got %d, want 3011", got)
	}
}

// A port held by a process outside Pupitre is not free: the remedy of a refusal reads the machine's sockets, not only the registry.
func TestARefusedPortProposesOneNothingListensOn(t *testing.T) {
	fake, file := loaded(t)
	fake.Files["/proc/net/tcp"] = listening(3001, 3002)

	err := file.Add(context(fake), registry.Project{Name: "twin", Dir: "twin", PkgMgr: "bun", Host: "127.0.0.1", Port: 3000, Cmd: "bun run dev"})
	if err == nil {
		t.Fatal("two projects on the same port must be refused")
	}

	failure := protocolError(t, err)
	if failure.Remedy == nil || failure.Remedy.PortFree != 3003 {
		t.Fatalf("the free port must skip what listens: %+v", failure.Remedy)
	}
}

func TestPathIsAbsoluteAndInsideTheProjectsRoot(t *testing.T) {
	_, file := loaded(t)

	for name, want := range map[string]string{
		"web":   registry.ProjectsDir + "/web",
		"mail":  registry.ProjectsDir + "/web/apps/mail",
		"api":   registry.ProjectsDir + "/api-server/server",
		"shots": registry.ProjectsDir,
	} {
		project, ok := file.Get(name)
		if !ok {
			t.Fatalf("%s missing from the registry", name)
		}

		if got := project.Path(registry.ProjectsDir); got != want {
			t.Fatalf("%s: got path %q, want %q", name, got, want)
		}

		if got := project.Contract(registry.ProjectsDir).Path; got != want {
			t.Fatalf("%s: the contract must carry the same path, got %q", name, got)
		}
	}

	mail, _ := file.Get("mail")
	if got := mail.RootPath(registry.ProjectsDir); got != registry.ProjectsDir+"/web" {
		t.Fatalf("the repository folder of mail is the first segment, got %q", got)
	}
}

func TestLabelFromFoldsANameIntoOneLabel(t *testing.T) {
	for name, want := range map[string]string{"web": "web", "my.site": "my-site", "My_App": "my-app", "--": "web"} {
		if got := registry.LabelFrom(name); got != want {
			t.Errorf("%q: got %q, want %q", name, got, want)
		}
	}
}

func TestUnderRefusesWhatLeavesTheRoot(t *testing.T) {
	root := "/home/dev/projects"

	for relative, want := range map[string]string{
		"web":              root + "/web",
		"web/apps/mail":    root + "/web/apps/mail",
		".":                root,
		"web/../mail":      root + "/mail",
		"/etc/shadow":      root + "/etc/shadow",
		"..":               "",
		"../../etc":        "",
		"web/../../../etc": "",
	} {
		if got := registry.Under(root, relative); got != want {
			t.Fatalf("%q: got %q, want %q", relative, got, want)
		}
	}
}

// TestLoadDropsARowThatAimsOutsideTheProjectsRoot: a hand-edited row in the registry file is not a project if its directory or name aims outside the root.
func TestLoadDropsARowThatAimsOutsideTheProjectsRoot(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[registry.DefaultConf] = []byte(strings.Join([]string{
		"web|web|-|bun|127.0.0.1|3000|web|bun run dev",
		"escapee|../../etc|-|none|127.0.0.1|3001|-|sh",
		"..|.|-|none|127.0.0.1|3002|-|sh",
		"deep|web/../../../etc|-|none|127.0.0.1|3003|-|sh",
	}, "\n"))

	file := registry.Load(context(fake), registry.Paths{})

	if len(file.Projects) != 1 || file.Projects[0].Name != "web" {
		t.Fatalf("only the contained row is a project: %+v", file.Projects)
	}

	for _, project := range file.Projects {
		path := project.Path(registry.ProjectsDir)
		if !strings.HasPrefix(path, registry.ProjectsDir) {
			t.Fatalf("%s renders %q, outside %s", project.Name, path, registry.ProjectsDir)
		}
	}
}

func protocolError(t *testing.T, err error) *protocol.Error {
	t.Helper()

	var failure *protocol.Error
	if !errors.As(err, &failure) {
		t.Fatalf("expected a protocol error, got %v", err)
	}

	return failure
}
