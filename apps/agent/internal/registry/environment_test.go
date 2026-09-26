package registry_test

import (
	"reflect"
	"testing"

	"pupitre.studio/agent/internal/registry"
)

func intranet() registry.Project {
	return registry.Project{Name: "intranet", Dir: "intranet", Processes: []registry.Process{
		{ID: "server", Dir: registry.RootDir, PkgMgr: "gradle", Host: "127.0.0.1", Port: 8080, Cmd: "./gradlew bootRun", Routes: []registry.Route{
			route("api", 8080, "api.flyleaf.dev"),
			route("admin-v2", 8081, ""),
		}},
		{ID: "web-client", Dir: "client", PkgMgr: "pnpm", Host: "intranet.localhost", Port: 5173, Cmd: "pnpm dev", Routes: []registry.Route{}},
	}}
}

func TestAProcessReceivesTheMachineItsProjectAndItself(t *testing.T) {
	project := intranet()

	got := project.ProcessEnvironment("/home/dev/projects", domain, project.Processes[0]).List()
	want := []string{
		"PUPITRE=1",
		"PUPITRE_DOMAIN=flyleaf.dev",
		"PUPITRE_HOST=127.0.0.1",
		"PUPITRE_LOCAL_URL=http://127.0.0.1:8080",
		"PUPITRE_PORT=8080",
		"PUPITRE_PROCESS=server",
		"PUPITRE_PROCESS_DIR=/home/dev/projects/intranet",
		"PUPITRE_PROCESS_SERVER_PORT=8080",
		"PUPITRE_PROCESS_SERVER_URL=https://api.flyleaf.dev",
		"PUPITRE_PROCESS_WEB_CLIENT_PORT=5173",
		"PUPITRE_PROCESS_WEB_CLIENT_URL=http://intranet.localhost:5173",
		"PUPITRE_PROJECT=intranet",
		"PUPITRE_PROJECTS_DIR=/home/dev/projects",
		"PUPITRE_PROJECT_DIR=/home/dev/projects/intranet",
		"PUPITRE_PROJECT_URL=https://api.flyleaf.dev",
		"PUPITRE_PUBLIC_URL=https://api.flyleaf.dev",
		"PUPITRE_ROUTE_ADMIN_V2_PORT=8081",
		"PUPITRE_ROUTE_ADMIN_V2_URL=http://127.0.0.1:8081",
		"PUPITRE_ROUTE_API_PORT=8080",
		"PUPITRE_ROUTE_API_URL=https://api.flyleaf.dev",
		"PUPITRE_URL=https://api.flyleaf.dev",
	}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %q\nwant %q", got, want)
	}
}

func TestAnUnpublishedProcessHasNoPublicURLAndAMachineWithoutDomainNoDomain(t *testing.T) {
	project := intranet()
	env := project.ProcessEnvironment("/home/dev/projects", "", project.Processes[1])

	for _, absent := range []string{"PUPITRE_PUBLIC_URL", "PUPITRE_DOMAIN"} {
		if value, set := env[absent]; set {
			t.Errorf("%s must be absent, got %q", absent, value)
		}
	}

	if env["PUPITRE_URL"] != "http://intranet.localhost:5173" || env["PUPITRE_PROCESS_DIR"] != "/home/dev/projects/intranet/client" {
		t.Fatalf("the process's own address and folder: %v", env)
	}
}

func TestATerminalTakesTheDeepestDeclaredFolderHoldingIt(t *testing.T) {
	file := &registry.File{Domain: domain, Projects: []registry.Project{intranet(), single("blog", "blog", 3000, "bun dev")}}
	document := file.EnvironmentDocument()

	cases := map[string]string{
		"/home/dev/projects/intranet":            "server",
		"/home/dev/projects/intranet/src/main":   "server",
		"/home/dev/projects/intranet/client":     "web-client",
		"/home/dev/projects/intranet/client/src": "web-client",
		"/home/dev/projects/intranet-old":        "",
		"/home/dev/projects":                     "",
		"/home/dev/projects/blog":                "blog",
	}

	for dir, process := range cases {
		env := document.At(dir)
		if got := lookup(env, "PUPITRE_PROCESS"); got != process {
			t.Errorf("%s: PUPITRE_PROCESS = %q, want %q", dir, got, process)
		}

		if lookup(env, "PUPITRE") != "1" || lookup(env, "PUPITRE_DOMAIN") != domain {
			t.Errorf("%s: the machine's variables hold everywhere: %q", dir, env)
		}
	}
}

func TestAProjectRootWithoutAProcessGetsTheProjectAlone(t *testing.T) {
	project := intranet()
	project.Processes[0].Dir = "server"

	document := (&registry.File{Projects: []registry.Project{project}}).EnvironmentDocument()
	env := document.At("/home/dev/projects/intranet")

	if lookup(env, "PUPITRE_PROJECT") != "intranet" || lookup(env, "PUPITRE_PROCESS") != "" || lookup(env, "PUPITRE_PROCESS_SERVER_PORT") != "8080" {
		t.Fatalf("the project's own variables, no process's: %q", env)
	}
}

func lookup(env []string, name string) string {
	for _, pair := range env {
		if len(pair) > len(name) && pair[:len(name)+1] == name+"=" {
			return pair[len(name)+1:]
		}
	}

	return ""
}
