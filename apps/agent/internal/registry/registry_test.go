package registry_test

import (
	"errors"
	"os"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
)

func fixture(t *testing.T, name string) []byte {
	t.Helper()

	raw, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatal(err)
	}

	return raw
}

func loaded(t *testing.T) (*modtest.FakeSys, *registry.File) {
	t.Helper()

	fake := modtest.NewFakeSys()
	fake.Files[registry.DefaultConf] = fixture(t, "projects.conf")
	fake.Files[registry.DefaultLocal] = fixture(t, "projects.local.conf")

	return fake, registry.Load(context(fake), registry.Paths{})
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
	if shots.Name != "shots" || shots.PkgMgr != "service" || shots.Port != 8099 || shots.Subdomain != "shots" {
		t.Fatalf("unexpected row: %+v", shots)
	}
	if shots.Cmd != "-" || shots.Install != "-" {
		t.Fatalf("the nine columns must be kept verbatim: %+v", shots)
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
	_, file := loaded(t)

	mail, _ := file.Get("mail")
	if mail.Port != 5180 {
		t.Fatalf("https:5180 must read as 5180, got %d", mail.Port)
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

	added := registry.Project{Name: "shop", Dir: "shop", Repo: "-", PkgMgr: "bun", Host: "127.0.0.1", Port: 3200, Subdomain: "shop", Cmd: "bun run dev --port 3200"}
	if err := file.Add(context(fake), added); err != nil {
		t.Fatal(err)
	}

	if string(fake.Files[registry.DefaultConf]) != before {
		t.Fatal("the repository registry must never be rewritten")
	}

	local := string(fake.Files[registry.DefaultLocal])
	if !strings.Contains(local, "shop|shop|-|bun|127.0.0.1|3200|shop|bun run dev --port 3200") {
		t.Fatalf("row missing from the local file:\n%s", local)
	}

	reloaded := registry.Load(context(fake), registry.Paths{})
	shop, ok := reloaded.Get("shop")
	if !ok || shop.Port != 3200 || !shop.Local {
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
	if _, taken := registry.Load(context(fake), registry.Paths{}).Get("twin"); taken {
		t.Fatal("a refused project must not be written")
	}
}

func TestAddRefusesADuplicateSubdomainAndName(t *testing.T) {
	fake, file := loaded(t)

	if err := file.Add(context(fake), registry.Project{Name: "other", Dir: "other", PkgMgr: "bun", Host: "127.0.0.1", Port: 3300, Subdomain: "web", Cmd: "bun run dev"}); err == nil {
		t.Fatal("a subdomain is unique")
	}

	if err := file.Add(context(fake), registry.Project{Name: "web", Dir: "web2", PkgMgr: "bun", Host: "127.0.0.1", Port: 3400, Cmd: "bun run dev"}); err == nil {
		t.Fatal("a name is unique")
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
		"pipe":    {Name: "pipe", Dir: "pipe", PkgMgr: "bun", Host: "127.0.0.1", Port: 3504, Cmd: "bun run dev | tee out"},
	} {
		if err := file.Add(context(fake), project); err == nil {
			t.Errorf("%s: must be refused", label)
		}
	}
}

func TestRemoveTakesTheLocalRowOut(t *testing.T) {
	fake, file := loaded(t)

	removed, err := file.Remove(context(fake), "web")
	if err != nil {
		t.Fatal(err)
	}
	if removed.Dir != "web" {
		t.Fatalf("the folder must be reported: %+v", removed)
	}

	reloaded := registry.Load(context(fake), registry.Paths{})
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

	api, ok := registry.Load(context(fake), registry.Paths{}).Get("api")
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
}

func protocolError(t *testing.T, err error) *protocol.Error {
	t.Helper()

	var failure *protocol.Error
	if !errors.As(err, &failure) {
		t.Fatalf("expected a protocol error, got %v", err)
	}

	return failure
}
