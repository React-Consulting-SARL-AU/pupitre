package main

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/platform"
)

// Register already refuses a handler the contract does not know; this is the other direction, a command of the contract nobody answers.
func TestTheServerAnswersEveryCommandOfTheContract(t *testing.T) {
	setupCLI(t)

	served := map[string]bool{}
	for _, cmd := range newServer(newEngine()).Capabilities() {
		served[contract.ParamsDefinition(cmd)] = true
	}

	for _, name := range contract.DefinitionNames() {
		if strings.HasSuffix(name, "Params") && !served[name] {
			t.Errorf("%s is in the contract and has no handler", name)
		}
	}
}

// Every answer the production server gives on a seeded machine has to be what the contract promises for its command.
func TestEveryAnswerMatchesItsResultDefinition(t *testing.T) {
	fake, dir := setupCLI(t)
	t.Setenv("PUPITRE_LOCK_PATH", filepath.Join(dir, "install.lock"))
	declareProject(fake)
	fake.Files["/home/dev/shots/2026-09-04/login.png"] = []byte("\x89PNG\r\n\x1a\n")
	fake.Files["/home/dev/projects/web/README.md"] = []byte("# web\n")
	fake.Files["/home/dev/projects/web/.env.example"] = []byte("API_KEY=\n")
	fake.Files["/proc/meminfo"] = []byte("MemTotal:       4015000 kB\n")
	fake.Files[platform.DefaultTokenPath] = []byte("jeton-de-serveur\n")

	console := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/agent/state":
			w.Write([]byte(`{"entitlement":"valid","valid_until":"2030-01-01T00:00:00Z","authorized_keys":[],"target_version":"1.4.0"}`))
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	}))
	defer console.Close()
	t.Setenv("PUPITRE_PLATFORM_URL", console.URL)

	lines := serveOn(t,
		`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":1}}`,
		`{"id":2,"cmd":"install","params":{"modules":["tool.demo","db.mysql","exposure.cloudflare"],"config":{"core.system":{"git_name":"Jordan","git_email":"jordan@example.org"},"tool.demo":{"port":9000},"db.mysql":{"engine":"mysql","port":3306,"app_user":"app","remote_user":"remote"},"exposure.cloudflare":{"domain":"pupitre.sh","account_tag":"acc-1234","tunnel_id":"t-1234"}},"secrets_stdin":true}}`,
		`{"tool.demo":{"password":"s3cret-de-test"},"db.mysql":{"app_password":"app-s3cret","remote_password":"remote-s3cret"},"exposure.cloudflare":{"tunnel_secret":"tunnel-s3cret"}}`,
	)
	installed := decodeResponse(t, lines[len(lines)-1])
	if installed["ok"] != true || len(installed["result"].(map[string]any)["failed"].([]any)) != 0 {
		t.Fatalf("install: %s", lines[len(lines)-1])
	}

	server := newServer(newEngine())

	cases := []struct {
		cmd    string
		params map[string]any
	}{
		{"catalog", map[string]any{}},
		{"module.config", map[string]any{"id": "tool.demo"}},
		{"install.check", map[string]any{"modules": []string{"tool.demo"}, "config": map[string]any{"tool.demo": map[string]any{"port": 9000}}}},
		{"project.list", map[string]any{}},
		{"project.add", map[string]any{"name": "api", "dir": "api", "repo": "-", "pkgmgr": "bun", "host": "127.0.0.1", "port": 3001, "routes": []map[string]any{{"label": "api", "port": 3001, "subdomain": "api"}}, "cmd": "bun run dev --port 3001", "install": "-"}},
		{"project.update", map[string]any{"name": "api", "patch": map[string]any{"routes": []map[string]any{{"label": "api", "port": 3001, "subdomain": "api"}, {"label": "docs", "port": 3002}}}}},
		{"project.up", map[string]any{"name": "web"}},
		{"project.logs", map[string]any{"name": "web"}},
		{"project.diff", map[string]any{"name": "web", "path": "README.md"}},
		{"project.git_status", map[string]any{"name": "web"}},
		{"project.working_tree", map[string]any{"name": "web"}},
		{"project.url", map[string]any{"name": "web"}},
		{"project.env", map[string]any{"name": "web"}},
		{"project.down", map[string]any{"name": "web"}},
		{"sessions.list", map[string]any{}},
		{"processes.list", map[string]any{}},
		{"shots.list", map[string]any{}},
		{"shots.read", map[string]any{"path": "2026-09-04/login.png"}},
		{"db.dump", map[string]any{"engine": "mysql"}},
		{"db.import", map[string]any{"engine": "mysql"}},
		{"tunnel.status", map[string]any{}},
		{"tunnel.sync", map[string]any{}},
		{"tunnel.restart", map[string]any{}},
		{"secrets.sync", map[string]any{"project": "web"}},
		{"platform.sync", map[string]any{}},
		{"doctor", map[string]any{}},
		{"diag", map[string]any{}},
		{"service.secret", map[string]any{"id": "tool.demo", "key": "DEMO_PASSWORD"}},
	}

	for _, tc := range cases {
		t.Run(tc.cmd, func(t *testing.T) {
			result, err := server.Call(tc.cmd, tc.params, nil)
			if err != nil {
				t.Fatalf("%s: %v", tc.cmd, err)
			}

			if err := contract.ValidateValue(contract.ResultDefinition(tc.cmd), result); err != nil {
				t.Fatalf("%s: %v", tc.cmd, err)
			}
		})
	}
}
