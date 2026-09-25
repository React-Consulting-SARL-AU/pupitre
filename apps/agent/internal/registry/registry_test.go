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

const domain = "flyleaf.dev"

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

func single(name, dir string, port int, cmd string, routes ...registry.Route) registry.Project {
	if routes == nil {
		routes = []registry.Route{}
	}

	return registry.Project{Name: name, Dir: dir, Processes: []registry.Process{
		{ID: registry.LabelFrom(name), Dir: registry.RootDir, PkgMgr: "bun", Host: "127.0.0.1", Port: port, Routes: routes, Cmd: cmd},
	}}
}

func process(project registry.Project, id string) registry.Process {
	for _, candidate := range project.Processes {
		if candidate.ID == id {
			return candidate
		}
	}

	return registry.Process{}
}

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
	if shots.Name != "shots" || len(shots.Processes) != 1 || !shots.IsService() {
		t.Fatalf("unexpected row: %+v", shots)
	}

	only := shots.Processes[0]
	if only.ID != "shots" || only.PkgMgr != "service" || only.Port != 8099 || only.Cmd != "-" || only.Dir != registry.RootDir {
		t.Fatalf("a row is a project of one process, its columns kept verbatim: %+v", only)
	}
	if len(only.Routes) != 1 || only.Routes[0].Label != "shots" || only.Routes[0].Port != 8099 || only.Routes[0].Hostname != "" {
		t.Fatalf("a subdomain of the repository's file is a route, without a hostname while the machine has no domain: %+v", only.Routes)
	}

	api := file.Projects[0]
	if api.Name != "api" || api.Dir != "api-server" || api.Repo != "https://github.com/me/api-server" || process(api, "api").Dir != "server" {
		t.Fatalf("the first segment of a row's folder is the repository, the rest the process's folder: %+v", api)
	}
}

func TestRowsOfOneRepositoryBecomeOneProject(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[registry.DefaultConf] = []byte(strings.Join([]string{
		"shop|shop/apps/web|https://github.com/me/shop|bun|127.0.0.1|3100|shop-web|bun run dev --port 3100",
		"other|other|-|bun|127.0.0.1|3300|-|bun run dev",
		"shop-mail|shop|-|none|127.0.0.1|3101|shop-mail|bun --cwd=apps/mail run dev -- --port 3101",
	}, "\n"))
	fake.Files[env.Path] = []byte(env.DomainKey + "=" + domain + "\n")

	file := registry.Load(context(fake), registry.Paths{})

	if len(file.Projects) != 2 || file.Projects[0].Name != "shop" || file.Projects[1].Name != "other" {
		t.Fatalf("got %+v, want shop then other", file.Projects)
	}

	shop := file.Projects[0]
	if shop.Dir != "shop" || shop.Repo != "https://github.com/me/shop" || len(shop.Processes) != 2 {
		t.Fatalf("unexpected project: %+v", shop)
	}
	if web := process(shop, "shop"); web.Dir != "apps/web" || web.Port != 3100 || web.Routes[0].Hostname != "shop-web."+domain {
		t.Fatalf("unexpected process: %+v", web)
	}
	if mail := process(shop, "shop-mail"); mail.Dir != registry.RootDir || mail.PkgMgr != "none" {
		t.Fatalf("unexpected process: %+v", mail)
	}

	projects, windows := registry.Group([]registry.Row{
		{Name: "api", Dir: "api-server/server", PkgMgr: "gradle", Host: "127.0.0.1", Port: 8080, Cmd: "./gradlew bootRun"},
		{Name: "api-web", Dir: "api-server/client", PkgMgr: "pnpm", Host: "127.0.0.1", Port: 5180, Cmd: "pnpm run dev"},
		{Name: "api-server", Dir: "elsewhere", PkgMgr: "bun", Host: "127.0.0.1", Port: 3000, Cmd: "bun run dev"},
	})
	if len(projects) != 2 || projects[0].Name != "api" || projects[1].Name != "api-server" {
		t.Fatalf("a folder name another row holds falls back to the first row: %+v", projects)
	}
	if windows["api"] != "api/api" || windows["api-web"] != "api/api-web" || windows["api-server"] != "api-server/api-server" {
		t.Fatalf("every row must know the window it became: %v", windows)
	}
}

func TestTheRepositoryRegistryTakesTheDomainOfTheMachine(t *testing.T) {
	_, file := loaded(t)

	shots, _ := file.Get("shots")
	if routes := shots.Processes[0].Routes; len(routes) != 1 || routes[0].Hostname != "shots."+domain {
		t.Fatalf("unexpected route: %+v", routes)
	}
	if got := shots.Contract(registry.ProjectsDir).Processes[0].Routes; len(got) != 1 || got[0].Hostname != "shots."+domain {
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
	if process(api, "api").Port != 8081 {
		t.Fatalf("the local row wins: got port %d, want 8081", process(api, "api").Port)
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

	want := "api shots web scratch"
	if strings.Join(names, " ") != want {
		t.Fatalf("got %q, want %q", strings.Join(names, " "), want)
	}
}

func TestPortKeepsOnlyItsNumber(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[registry.DefaultConf] = []byte("mail|web/apps/mail|-|pnpm|127.0.0.1|https:5180|mail|pnpm run dev --port 5180\n")

	mail, _ := registry.Load(context(fake), registry.Paths{}).Get("mail")
	if mail.Processes[0].Port != 5180 {
		t.Fatalf("https:5180 must read as 5180, got %d", mail.Processes[0].Port)
	}
}

func TestTheLocalRegistryIsOneJSONDocument(t *testing.T) {
	_, file := loaded(t)

	web, ok := file.Get("web")
	if !ok || !web.Local || web.Repo != "https://github.com/me/web" || len(web.Processes) != 2 {
		t.Fatalf("unexpected row: %+v", web)
	}
	if routes := process(web, "web").Routes; len(routes) != 2 || routes[1] != route("admin", 3010, "admin-web."+domain) {
		t.Fatalf("every route of the document is read: %+v", routes)
	}
	if mail := process(web, "mail"); mail.Dir != "apps/mail" || mail.PkgMgr != "pnpm" {
		t.Fatalf("every process of the document is read: %+v", mail)
	}
	if scratch, _ := file.Get("scratch"); scratch.Processes[0].Dir != registry.RootDir {
		t.Fatalf("a process without a folder runs from the project's own: %+v", scratch.Processes[0])
	}

	if _, err := registry.ParseLocal([]byte("web|web|-|bun|127.0.0.1|3000|web|bun run dev\n")); err == nil {
		t.Fatal("the local file is read as JSON, and as nothing else")
	}
}

func TestInstallCommandIsDerivedWhenTheColumnIsEmpty(t *testing.T) {
	_, file := loaded(t)

	for window, want := range map[string]string{
		"web/web":         "bun install",
		"api/api":         "./gradlew --version",
		"web/mail":        "pnpm install",
		"scratch/scratch": "",
		"shots/shots":     "",
	} {
		name, id, _ := registry.SplitWindow(window)
		project, ok := file.Get(name)
		if !ok {
			t.Fatalf("%s missing from the registry", name)
		}

		if got := process(project, id).InstallCommand(); got != want {
			t.Errorf("%s: got %q, want %q", window, got, want)
		}
	}
}

func TestInstallColumnWinsOverTheDerivedCommand(t *testing.T) {
	_, file := loaded(t)

	scratch, _ := file.Get("scratch")
	if scratch.Processes[0].Install != "" {
		t.Fatalf("scratch has no install column: %q", scratch.Processes[0].Install)
	}

	api, ok := file.Get("api")
	if !ok {
		t.Fatal("api missing")
	}

	python := process(api, "api")
	python.Install = "python3 -m venv .venv"
	if got := python.InstallCommand(); got != "python3 -m venv .venv" {
		t.Fatalf("got %q", got)
	}
}

func TestAddWritesTheLocalFileOnly(t *testing.T) {
	fake, file := loaded(t)
	before := string(fake.Files[registry.DefaultConf])

	added := single("shop", "shop", 3200, "bun run dev --port 3200", route("shop", 3200, "shop."+domain))
	added.Repo = "-"
	if err := file.Add(context(fake), added); err != nil {
		t.Fatal(err)
	}

	if string(fake.Files[registry.DefaultConf]) != before {
		t.Fatal("the repository registry must never be rewritten")
	}

	local := string(fake.Files[registry.DefaultLocal])
	if !strings.Contains(local, `"name": "shop"`) || !strings.Contains(local, `"hostname": "shop.flyleaf.dev"`) || strings.Contains(local, `"repo": "-"`) {
		t.Fatalf("the row must be written as JSON, its values without the dashes of the old format:\n%s", local)
	}

	reloaded := reload(fake)
	shop, ok := reloaded.Get("shop")
	if !ok || shop.Processes[0].Port != 3200 || !shop.Local || shop.Repo != "" || len(shop.Processes[0].Routes) != 1 {
		t.Fatalf("unexpected row after a reload: %+v", shop)
	}
	if _, ok := reloaded.Get("web"); !ok {
		t.Fatal("adding must not drop the other local rows")
	}
}

func TestAddRefusesADuplicatePortWithAFix(t *testing.T) {
	fake, file := loaded(t)

	err := file.Add(context(fake), single("twin", "twin", 3000, "bun run dev"))
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

	err := file.Add(context(fake), single("other", "other", 3300, "bun run dev", route("other", 3300, "admin-web."+domain)))
	if err == nil {
		t.Fatal("a hostname is unique, whichever route of a project holds it")
	}
	if failure := protocolError(t, err); !strings.Contains(failure.Message, "admin-web."+domain) || !strings.Contains(failure.Message, "web") || failure.Fix == "" {
		t.Fatalf("the refusal must name the address and its holder, with a fix: %+v", failure)
	}

	if err := file.Add(context(fake), single("web", "web2", 3400, "bun run dev")); err == nil {
		t.Fatal("a name is unique")
	}

	if err := file.Add(context(fake), single("web2", "web", 3400, "bun run dev")); err == nil {
		t.Fatal("a folder is one project: a second process goes on the first")
	}
}

func TestAddTakesSeveralProcessesAndRefusesWhatTheyShare(t *testing.T) {
	fake, file := loaded(t)

	intranet := registry.Project{Name: "intranet", Dir: "intranet", Repo: "https://github.com/me/intranet", Processes: []registry.Process{
		{ID: "server", Dir: registry.RootDir, PkgMgr: "gradle", Host: "127.0.0.1", Port: 8090, Routes: []registry.Route{}, Cmd: "./gradlew :server:bootRun"},
		{ID: "client", Dir: "client", PkgMgr: "pnpm", Host: "127.0.0.1", Port: 3001, Routes: []registry.Route{route("client", 3001, "intranet."+domain)}, Cmd: "pnpm dev"},
	}}
	if err := file.Add(context(fake), intranet); err != nil {
		t.Fatal(err)
	}

	added, _ := reload(fake).Get("intranet")
	if len(added.Processes) != 2 || process(added, "client").Dir != "client" || added.Processes[0].ID != "server" {
		t.Fatalf("both processes must be written, in order: %+v", added)
	}
	if got := added.Contract(registry.ProjectsDir); got.Processes[1].Path != registry.ProjectsDir+"/intranet/client" || got.Processes[0].Path != registry.ProjectsDir+"/intranet" {
		t.Fatalf("each process carries its own absolute path: %+v", got.Processes)
	}

	for label, processes := range map[string][]registry.Process{
		"same id":   {intranet.Processes[0], {ID: "server", PkgMgr: "bun", Host: "127.0.0.1", Port: 3002, Cmd: "bun dev"}},
		"same port": {intranet.Processes[0], {ID: "twin", PkgMgr: "bun", Host: "127.0.0.1", Port: 8090, Cmd: "bun dev"}},
		"bad id":    {{ID: "Server", PkgMgr: "bun", Host: "127.0.0.1", Port: 3002, Cmd: "bun dev"}},
		"escape":    {{ID: "up", Dir: "../etc", PkgMgr: "bun", Host: "127.0.0.1", Port: 3002, Cmd: "bun dev"}},
		"none":      {},
	} {
		if err := file.Add(context(fake), registry.Project{Name: "bad-" + registry.LabelFrom(label), Dir: "bad-" + registry.LabelFrom(label), Processes: processes}); err == nil {
			t.Errorf("%s: must be refused", label)
		}
	}
}

func TestAddRefusesAPortHeldByARouteOfAnotherProject(t *testing.T) {
	fake, file := loaded(t)

	err := file.Add(context(fake), single("twin", "twin", 3200, "bun run dev", route("web", 3200, ""), route("api", 3010, "")))
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
		err := file.Add(context(fake), single("h-"+label, "h", 3900, "bun run dev", route("web", 3900, hostname)))
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
		if err := file.Add(context(fake), single("l-"+label, "l", 3900, "bun run dev", routes...)); err == nil {
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

	yarny := single("yarny", "yarny", 3503, "yarn dev")
	yarny.Processes[0].PkgMgr = "yarn"

	for label, project := range map[string]registry.Project{
		"name":    single("Web", "web3", 3500, "bun run dev"),
		"escape":  single("up", "../etc", 3501, "bun run dev"),
		"absolue": single("abs", "/etc", 3502, "bun run dev"),
		"port":    single("low", "low", 80, "bun run dev"),
		"pkgmgr":  yarny,
		"route":   single("low-route", "low", 3504, "bun run dev", route("web", 80, "")),
	} {
		if err := file.Add(context(fake), project); err == nil {
			t.Errorf("%s: must be refused", label)
		}
	}
}

func TestBranchIsWrittenAndReadBack(t *testing.T) {
	fake, file := loaded(t)

	added := single("two", "two", 3200, "bun run dev --port 3200")
	added.Repo = "https://github.com/me/two"
	added.Branch = "release/2.0"
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
	if two.Processes[0].InstallCommand() != "bun install" {
		t.Fatalf(`an absent install line still derives its command: %q`, two.Processes[0].InstallCommand())
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
	if nine.Processes[0].InstallCommand() != "bun install --frozen-lockfile" {
		t.Fatalf("a nine-column row keeps its install command: %q", nine.Processes[0].InstallCommand())
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

func TestUpdateReplacesTheProcessesAndKeepsTheRest(t *testing.T) {
	fake, file := loaded(t)

	before, _ := file.Get("web")
	web := process(before, "web")
	web.Cmd = "turbo run dev"
	web.Routes = []registry.Route{route("web", 3000, "boutique."+domain), route("api", 3001, "api-boutique."+domain)}
	processes := []registry.Process{web}

	updated, err := file.Update(context(fake), "web", registry.Patch{Processes: &processes})
	if err != nil {
		t.Fatal(err)
	}

	if updated.Repo != "https://github.com/me/web" || len(updated.Processes) != 1 || updated.Processes[0].Port != 3000 {
		t.Fatalf("the rest of the row must stay, and the list is replaced whole: %+v", updated)
	}
	if routes := updated.Processes[0].Routes; len(routes) != 2 || routes[0].Hostname != "boutique."+domain {
		t.Fatalf("the routes are replaced with the process: %+v", routes)
	}

	reloaded, _ := reload(fake).Get("web")
	if reloaded.Processes[0].Cmd != "turbo run dev" || len(reloaded.Processes) != 1 {
		t.Fatalf("the update must survive a reload: %+v", reloaded)
	}
	if _, ok := reload(fake).Get("scratch"); !ok {
		t.Fatal("the other local rows must stay")
	}

	branch := "release/2.0"
	updated, err = file.Update(context(fake), "web", registry.Patch{Branch: &branch})
	if err != nil || updated.Branch != branch || len(updated.Processes) != 1 {
		t.Fatalf("a branch alone changes nothing else: %+v, %v", updated, err)
	}
}

func TestRehostMovesEveryNameUnderTheOldDomain(t *testing.T) {
	fake, file := loaded(t)

	moved, err := file.Rehost(context(fake), domain, "flyleaf.studio")
	if err != nil {
		t.Fatal(err)
	}

	want := []string{"admin-web.flyleaf.dev", "api.flyleaf.dev", "mail.flyleaf.dev", "web.flyleaf.dev"}
	if !reflect.DeepEqual(moved, want) {
		t.Fatalf("moved = %v, want %v", moved, want)
	}

	if file.Domain != "flyleaf.studio" {
		t.Fatalf("the registry now resolves against %q", file.Domain)
	}

	web, _ := reload(fake).Get("web")
	if routes := process(web, "web").Routes; routes[0].Hostname != "web.flyleaf.studio" || routes[1].Hostname != "admin-web.flyleaf.studio" {
		t.Fatalf("the move must survive a reload: %+v", routes)
	}
	if routes := process(web, "mail").Routes; routes[0].Hostname != "mail.flyleaf.studio" {
		t.Fatalf("every process moves: %+v", routes)
	}

	again, err := file.Rehost(context(fake), "flyleaf.studio", "flyleaf.studio")
	if err != nil || len(again) != 0 {
		t.Fatalf("the same domain moves nothing: %v, %v", again, err)
	}
}

func TestUpdateDoesNotCompeteWithItself(t *testing.T) {
	fake, file := loaded(t)

	current, _ := file.Get("web")
	same := append([]registry.Process{}, current.Processes...)
	if _, err := file.Update(context(fake), "web", registry.Patch{Processes: &same}); err != nil {
		t.Fatalf("keeping one's own port and hostname is not a collision: %v", err)
	}

	web := process(current, "web")
	web.Routes = []registry.Route{route("web", 3000, "api."+domain)}
	taken := []registry.Process{web}
	if _, err := file.Update(context(fake), "web", registry.Patch{Processes: &taken}); err == nil {
		t.Fatal("another project's hostname is still taken")
	}

	branch := "main"
	if _, err := file.Update(context(fake), "shots", registry.Patch{Branch: &branch}); err == nil {
		t.Fatal("a row of the repository is not rewritten here")
	}

	if _, err := file.Update(context(fake), "ghost", registry.Patch{}); err == nil {
		t.Fatal("an unknown project must be refused")
	}
}

func TestAddRefusesABranchGitMustNeverSee(t *testing.T) {
	fake, file := loaded(t)

	orphan := single("orphan", "orphan", 3700, "bun run dev")
	orphan.Branch = "--orphan"
	if err := file.Add(context(fake), orphan); err == nil {
		t.Fatal("an option must never pass for a branch name")
	}
}

func TestRemoveTakesTheLocalRowOut(t *testing.T) {
	fake, file := loaded(t)

	removed, err := file.Remove(context(fake), "web")
	if err != nil {
		t.Fatal(err)
	}
	if removed.Dir != "web" || len(removed.Hostnames()) != 3 {
		t.Fatalf("the folder and the names on the web of every process must be reported: %+v", removed)
	}

	reloaded := reload(fake)
	if _, ok := reloaded.Get("web"); ok {
		t.Fatal("web must be gone")
	}
	if _, ok := reloaded.Get("scratch"); !ok {
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
	if api.Processes[0].Port != 8080 || api.Local {
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

func TestARefusedPortProposesOneNothingListensOn(t *testing.T) {
	fake, file := loaded(t)
	fake.Files["/proc/net/tcp"] = listening(3001, 3002)

	err := file.Add(context(fake), single("twin", "twin", 3000, "bun run dev"))
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
		"api":   registry.ProjectsDir + "/api-server",
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

	web, _ := file.Get("web")
	if got := process(web, "mail").Path(web.Path(registry.ProjectsDir)); got != registry.ProjectsDir+"/web/apps/mail" {
		t.Fatalf("a process runs under its project's folder, got %q", got)
	}

	api, _ := file.Get("api")
	if got := process(api, "api").Path(api.Path(registry.ProjectsDir)); got != registry.ProjectsDir+"/api-server/server" {
		t.Fatalf("got %q", got)
	}
}

func TestWindowNamesAProcessOfAProject(t *testing.T) {
	if got := registry.Window("intranet", "server"); got != "intranet/server" {
		t.Fatalf("got %q", got)
	}

	project, process, ours := registry.SplitWindow("intranet/server")
	if !ours || project != "intranet" || process != "server" {
		t.Fatalf("got %q %q %v", project, process, ours)
	}

	for _, window := range []string{"scratch", "", "/server", "intranet/"} {
		if _, _, ours := registry.SplitWindow(window); ours {
			t.Errorf("%q is not a window of ours", window)
		}
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

func TestAnUnreadableLocalFileIsAProblemAndIsNeverRewritten(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[registry.DefaultConf] = fixture(t, "projects.conf")
	fake.Files[registry.DefaultLocal] = []byte("{\"projects\": [ oops\n")
	ctx := modtest.NewSysContext(fake)

	file := registry.Load(ctx, registry.Paths{Backups: "/var/lib/pupitre/config-backups"})

	if file.Problem() == nil {
		t.Fatal("the load must say the local file is unreadable")
	}
	if len(file.Projects) != 2 {
		t.Fatalf("the repository's rows still read: %+v", file.Projects)
	}

	failure := protocolError(t, file.Problem())
	if failure.Code != contract.ErrorBadRequest || !strings.Contains(failure.Message, registry.DefaultLocal) || !strings.Contains(failure.Fix, "/var/lib/pupitre/config-backups") {
		t.Fatalf("the refusal must name the file and the backups: %+v", failure)
	}

	added := single("shop", "shop", 3200, "bun run dev --port 3200")
	if err := file.Add(ctx, added); err == nil {
		t.Fatal("a write on a registry that did not load cleanly must be refused")
	}
	if _, err := file.Update(ctx, "api", registry.Patch{}); err == nil {
		t.Fatal("an update on a registry that did not load cleanly must be refused")
	}
	if _, err := file.Remove(ctx, "api"); err == nil {
		t.Fatal("a removal on a registry that did not load cleanly must be refused")
	}

	if string(fake.Files[registry.DefaultLocal]) != "{\"projects\": [ oops\n" {
		t.Fatalf("the file was rewritten:\n%s", fake.Files[registry.DefaultLocal])
	}

	if journal := strings.Join(ctx.Output(), "\n"); !strings.Contains(journal, registry.DefaultLocal) {
		t.Fatalf("the problem must be journaled:\n%s", journal)
	}
}

func TestARowThatFailsValidationSurvivesAWriteVerbatim(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[env.Path] = []byte(env.DomainKey + "=" + domain + "\n")
	fake.Files[registry.DefaultLocal] = []byte(`{"projects": [
  {"name": "Bad Name", "dir": "bad", "processes": [{"id": "bad", "dir": ".", "pkgmgr": "bun", "host": "127.0.0.1", "port": 3100, "routes": [], "cmd": "bun run dev"}], "runtimes": {}, "boot": false},
  {"name": "escapee", "dir": "../../etc", "processes": [{"id": "escapee", "dir": ".", "pkgmgr": "bun", "host": "127.0.0.1", "port": 3101, "routes": [], "cmd": "bun run dev"}], "runtimes": {}, "boot": false},
  {"name": "odd", "dir": "odd", "processes": "not a list"},
  {"name": "web", "dir": "web", "processes": [{"id": "web", "dir": ".", "pkgmgr": "bun", "host": "127.0.0.1", "port": 3000, "routes": [], "cmd": "bun run dev --port 3000"}], "runtimes": {}, "boot": false}
]}
`)
	ctx := modtest.NewSysContext(fake)

	file := registry.Load(ctx, registry.Paths{})
	if file.Problem() != nil {
		t.Fatalf("a row that fails validation is not a problem of the file: %v", file.Problem())
	}
	if len(file.Projects) != 1 || file.Projects[0].Name != "web" {
		t.Fatalf("only the valid row is a project: %+v", file.Projects)
	}

	if journal := strings.Join(ctx.Output(), "\n"); !strings.Contains(journal, "Bad Name") || !strings.Contains(journal, "escapee") || !strings.Contains(journal, "odd") {
		t.Fatalf("every row set aside must be journaled:\n%s", journal)
	}

	if err := file.Add(ctx, single("shop", "shop", 3200, "bun run dev --port 3200")); err != nil {
		t.Fatal(err)
	}

	local := string(fake.Files[registry.DefaultLocal])

	for _, kept := range []string{`"Bad Name"`, `"../../etc"`, `"not a list"`, `"shop"`, `"web"`} {
		if !strings.Contains(local, kept) {
			t.Fatalf("%s must survive the write:\n%s", kept, local)
		}
	}

	reloaded := reload(fake)
	if len(reloaded.Projects) != 2 {
		t.Fatalf("the rows set aside stay set aside: %+v", reloaded.Projects)
	}
}

func TestRemovableRefusesARowOfTheRepositoryBeforeAnyWrite(t *testing.T) {
	_, file := loaded(t)

	if err := file.Removable("shots"); err == nil {
		t.Fatal("a row of the repository is not removable")
	}
	if err := file.Removable("ghost"); err == nil {
		t.Fatal("an unknown project is not removable")
	}
	if err := file.Removable("web"); err != nil {
		t.Fatalf("a local row is removable: %v", err)
	}
}
