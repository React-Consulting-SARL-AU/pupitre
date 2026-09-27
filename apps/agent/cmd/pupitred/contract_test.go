package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/daemon"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sudo"
	"pupitre.studio/agent/internal/sys/env"
)

// Register already refuses a handler the contract does not know; this checks the other direction.
func TestTheServerAnswersEveryCommandOfTheContract(t *testing.T) {
	setupCLI(t)

	served := map[string]bool{}

	for _, cmd := range newServer(newEngine(), false).Capabilities() {
		served[contract.ParamsDefinition(cmd)] = true
	}

	for _, name := range contract.DefinitionNames() {
		if strings.HasSuffix(name, "Params") && !served[name] {
			t.Errorf("%s is in the contract and has no handler", name)
		}
	}
}

type answerCase struct {
	cmd    string
	params map[string]any
	secret string
}

type checkedElsewhere struct {
	why   string
	where string
}

const bucketUnreachable = "the production server reaches a bucket over HTTPS with the system's roots alone, so no test bucket answers it here"

var answersCheckedElsewhere = map[string]checkedElsewhere{
	"agent.upgrade":        {why: "a release is verified against the key embedded in the binary, which no test can sign for", where: "internal/selfupdate/commands_test.go TestAgentUpgradeAnswersInRestrictedMode"},
	"backup.run":           {why: bucketUnreachable, where: "internal/backup/commands_test.go TestABackupFromTheProtocolStreamsItsSteps"},
	"backup.inspect":       {why: bucketUnreachable, where: "internal/backup/run_test.go TestTheManifestIsWrittenLastAndDeclaredWithItsDigest, as BackupManifest, which BackupInspectResult repeats"},
	"backup.delete":        {why: bucketUnreachable, where: "internal/backup/prune_test.go TestDeletingABackupEmptiesItsPrefixAndTellsThePlatform, field by field"},
	"backup.restore.setup": {why: bucketUnreachable, where: "internal/backup/restore_test.go TestAFreshServerComesBackAsTheBackupLeftIt"},
	"backup.restore.data":  {why: bucketUnreachable, where: "internal/backup/restore_test.go TestAFreshServerComesBackAsTheBackupLeftIt"},
}

const (
	hostKey        = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIIpnKVP1oHEgOAeBppA7YR+8vwKg5ylIyTLxWKT7IaS"
	trustedKey     = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl"
	sudoPassword   = "$6$rounds=100000$Wq3vX8zYk1pL0sQe$PrJH1rPtYcXhyW28FJS0rQ7sq5jLB9mY/GZ8GL1MQMXesQF1UBBe.X8g.Z1cutPJzEeignRlhLB1GHAcUHivm."
	enrolmentToken = "enr-jeton-de-test"
)

// In order: each case runs on the machine the ones before it left.
func answerCases(platformURL string) []answerCase {
	web := map[string]any{"name": "web"}
	demo := map[string]any{"id": "tool.demo"}
	api := []map[string]any{{"id": "api", "pkgmgr": "bun", "host": "127.0.0.1", "port": 3001, "routes": []map[string]any{{"label": "api", "port": 3001, "subdomain": "api"}}, "cmd": "bun run dev --port 3001", "install": "-"}}

	return []answerCase{
		{cmd: "hello", params: map[string]any{"app_version": "0.2.0", "protocol": contract.ProtocolVersion}},
		{cmd: "ping"},
		{cmd: "catalog"},
		{cmd: "module.config", params: demo},
		{cmd: "install.check", params: map[string]any{"modules": []string{"tool.demo"}, "config": map[string]any{"tool.demo": map[string]any{"port": 9000}}}},
		{cmd: "install", params: map[string]any{"modules": []string{"tool.demo"}, "config": map[string]any{"tool.demo": map[string]any{"port": 9000}}, "secrets_stdin": true}, secret: `{"tool.demo":{"password":"s3cret-de-test"}}`},
		{cmd: "upgrade", params: map[string]any{"modules": []string{"tool.demo"}}},
		{cmd: "report"},
		{cmd: "probe"},
		{cmd: "agent.migrate"},
		{cmd: "snapshot"},
		{cmd: "status"},
		{cmd: "service.status", params: demo},
		{cmd: "service.stop", params: demo},
		{cmd: "service.start", params: demo},
		{cmd: "service.restart", params: demo},
		{cmd: "service.logs", params: map[string]any{"id": "tool.demo", "lines": 2}},
		{cmd: "service.secret", params: map[string]any{"id": "tool.demo", "key": "DEMO_PASSWORD"}},
		{cmd: "completions", params: map[string]any{"path": "web"}},
		{cmd: "project.detect", params: map[string]any{"dir": "flyleaf"}},
		{cmd: "project.list"},
		{cmd: "project.add", params: map[string]any{"name": "api", "dir": "api", "repo": "-", "processes": api}},
		{cmd: "project.update", params: map[string]any{"name": "api", "patch": map[string]any{"processes": []map[string]any{{"id": "api", "pkgmgr": "bun", "host": "127.0.0.1", "port": 3001, "routes": []map[string]any{{"label": "api", "port": 3001, "subdomain": "api"}, {"label": "docs", "port": 3002}}, "cmd": "bun run dev --port 3001"}}}}},
		{cmd: "project.remove", params: map[string]any{"name": "api"}},
		{cmd: "project.up", params: web},
		{cmd: "project.restart", params: web},
		{cmd: "project.debug", params: map[string]any{"name": "web", "process": "web"}},
		{cmd: "project.logs", params: map[string]any{"name": "web", "process": "web"}},
		{cmd: "project.install", params: web},
		{cmd: "project.branches", params: web},
		{cmd: "project.checkout", params: map[string]any{"name": "web", "branch": "main"}},
		{cmd: "project.pull", params: web},
		{cmd: "project.sync", params: web},
		{cmd: "project.git_status", params: web},
		{cmd: "project.working_tree", params: web},
		{cmd: "project.diff", params: map[string]any{"name": "web", "path": "README.md"}},
		{cmd: "project.url", params: web},
		{cmd: "project.env", params: web},
		{cmd: "project.down", params: web},
		{cmd: "agent.open", params: map[string]any{"kind": "claude", "project": "web"}},
		{cmd: "sessions.list"},
		{cmd: "processes.list"},
		{cmd: "process.kill", params: map[string]any{"pid": 5200}},
		{cmd: "sessions.clean"},
		{cmd: "shots.list"},
		{cmd: "shots.url"},
		{cmd: "shots.read", params: map[string]any{"path": "2026-09-04/login.png"}},
		{cmd: "shots.clean", params: map[string]any{"path": "2026-09-04/login.png"}},
		{cmd: "fs.list", params: map[string]any{"path": "notes"}},
		{cmd: "fs.stat", params: map[string]any{"path": "notes/readme.md", "hash": true}},
		{cmd: "fs.read", params: map[string]any{"path": "notes/readme.md"}},
		{cmd: "fs.write", params: map[string]any{"path": "notes/todo.md", "content": "LSByaWVuCg=="}},
		{cmd: "fs.mkdir", params: map[string]any{"path": "notes/drafts"}},
		{cmd: "fs.rename", params: map[string]any{"path": "notes/todo.md", "to": "notes/drafts/todo.md"}},
		{cmd: "fs.remove", params: map[string]any{"path": "notes/drafts", "recursive": true}},
		{cmd: "db.dump", params: map[string]any{"engine": "mysql"}},
		{cmd: "db.import", params: map[string]any{"engine": "mysql"}},
		{cmd: "db.shell", params: map[string]any{"engine": "mysql", "name": "shop"}},
		{cmd: "db.url", params: map[string]any{"engine": "mysql", "name": "shop"}},
		{cmd: "tunnel.status"},
		{cmd: "tunnel.sync"},
		{cmd: "tunnel.restart"},
		{cmd: "access.create", params: map[string]any{"id": "abcdef012345", "name": "Simulateur iOS", "hash": strings.Repeat("f", 64), "projects": []string{"web"}}},
		{cmd: "access.update", params: map[string]any{"id": "abcdef012345", "projects": nil}},
		{cmd: "access.list"},
		{cmd: "access.revoke", params: map[string]any{"id": "abcdef012345"}},
		{cmd: "secrets.sync", params: map[string]any{"project": "web"}},
		{cmd: "backup.status"},
		{cmd: "backup.contents"},
		{cmd: "backup.restore.abort"},
		{cmd: "platform.sync"},
		{cmd: "keys.trust", params: map[string]any{"public_key": trustedKey}},
		{cmd: "keys.sync"},
		{cmd: "keys.list"},
		{cmd: "doctor"},
		{cmd: "diag"},
		{cmd: "harden", params: map[string]any{"user": "dev"}},
		{cmd: "harden.sudo", params: map[string]any{"user": "dev", "secrets_stdin": true}, secret: `{"password_hash":"` + sudoPassword + `"}`},
		{cmd: "enroll", params: map[string]any{"platform_url": platformURL, "secrets_stdin": true}, secret: `{"enrollment_token":"` + enrolmentToken + `"}`},
		{cmd: "uninstall", params: map[string]any{"modules": []string{"tool.demo"}}},
		{cmd: "reboot"},
	}
}

func TestEveryServedCommandHasItsAnswerChecked(t *testing.T) {
	setupCLI(t)

	checked := map[string]bool{}

	for _, tc := range answerCases("http://platform.test") {
		if checked[tc.cmd] {
			t.Errorf("%s has two cases", tc.cmd)
		}

		checked[tc.cmd] = true
	}

	served := map[string]bool{}

	for _, cmd := range newServer(newEngine(), false).Capabilities() {
		served[cmd] = true
		_, excluded := answersCheckedElsewhere[cmd]

		switch {
		case checked[cmd] && excluded:
			t.Errorf("%s has a case and is excluded", cmd)
		case !checked[cmd] && !excluded:
			t.Errorf("%s is served and nothing holds its answer to %s", cmd, contract.ResultDefinition(cmd))
		}
	}

	for cmd := range checked {
		if !served[cmd] {
			t.Errorf("%s has a case and is no longer served", cmd)
		}
	}

	for cmd, elsewhere := range answersCheckedElsewhere {
		if !served[cmd] {
			t.Errorf("%s is excluded and is no longer served", cmd)
		}

		if elsewhere.why == "" || elsewhere.where == "" {
			t.Errorf("%s is excluded without saying why and where its answer is checked", cmd)
		}
	}
}

func TestEveryAnswerMatchesItsResultDefinition(t *testing.T) {
	fake, dir := setupCLI(t)
	t.Setenv("PUPITRE_LOCK_PATH", filepath.Join(dir, "install.lock"))
	t.Setenv("PUPITRE_PROJECT_INSTALL_LOCK_PATH", filepath.Join(dir, "project-install.lock"))
	t.Setenv("PUPITRE_ACCESS_LOCK_PATH", filepath.Join(dir, "access.lock"))
	seedMachine(fake)

	console := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/agent/state":
			w.Write([]byte(`{"entitlement":"valid","valid_until":"2030-01-01T00:00:00Z","authorized_keys":[],"target_version":"1.4.0"}`))
		case "/agent/exchange":
			w.Write([]byte(`{"server_token":"jeton-de-serveur-neuf"}`))
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	}))
	defer console.Close()

	t.Setenv("PUPITRE_PLATFORM_URL", console.URL)

	lines := serveOn(t,
		helloLine,
		`{"id":2,"cmd":"install","params":{"modules":["tool.demo","db.mysql","exposure.cloudflare"],"config":{"core.system":{"git_name":"Jordan","git_email":"jordan@example.org"},"tool.demo":{"port":9000},"db.mysql":{"engine":"mysql","port":3306,"app_user":"app","remote_user":"remote"},"exposure.cloudflare":{"domain":"pupitre.sh","account_tag":"0123456789abcdef0123456789abcdef","tunnel_id":"01234567-89ab-cdef-0123-456789abcdef"}},"secrets_stdin":true}}`,
		`{"tool.demo":{"password":"s3cret-de-test"},"db.mysql":{"app_password":"app-s3cret","remote_password":"remote-s3cret"},"exposure.cloudflare":{"tunnel_secret":"tunnel-s3cret"}}`,
	)

	installed := decodeResponse(t, lines[len(lines)-1])
	if installed["ok"] != true || len(installed["result"].(map[string]any)["failed"].([]any)) != 0 {
		t.Fatalf("install: %s", lines[len(lines)-1])
	}

	fake.Files[env.Path] = append(fake.Files[env.Path], []byte("PUPITRE_DEBUG_PORTS=\"web/web:9229\"\n")...)

	previous := effectiveUID
	effectiveUID = func() int { return 0 }
	t.Cleanup(func() { effectiveUID = previous })

	server := newServer(newEngine(), false)

	for _, tc := range answerCases(console.URL) {
		t.Run(tc.cmd, func(t *testing.T) {
			result := answer(t, server, tc)

			if err := contract.ValidateValue(contract.ResultDefinition(tc.cmd), result); err != nil {
				t.Fatalf("%s: %v", tc.cmd, err)
			}
		})
	}
}

func seedMachine(fake *modtest.FakeSys) {
	fake.Files[registry.DefaultConf] = []byte("web|web|https://github.com/me/web|bun|127.0.0.1|3000|web|bun run dev --port 3000\n")
	fake.Dirs["/home/dev/projects/web"] = true
	fake.Serves("web/web", 3000)
	fake.Files["/home/dev/projects/web/.git"] = []byte("gitdir\n")
	fake.Files["/home/dev/projects/web/README.md"] = []byte("# web\n")
	fake.Files["/home/dev/projects/web/.env.example"] = []byte("API_KEY=\n")
	fake.Answer("rev-parse --show-toplevel", "/home/dev/projects/web\n")
	fake.Answer("rev-parse --abbrev-ref HEAD", "main\n")
	fake.Answer("for-each-ref --format=%(refname:short) refs/heads", "main\n")

	fake.Dirs["/home/dev/projects/flyleaf"] = true
	fake.Files["/home/dev/projects/flyleaf/package.json"] = []byte(`{"scripts":{"dev":"vite"}}` + "\n")

	fake.Dirs["/home/dev/notes"] = true
	fake.Files["/home/dev/notes/readme.md"] = []byte("# notes\n")
	fake.Files["/home/dev/shots/2026-09-04/login.png"] = []byte("\x89PNG\r\n\x1a\n")
	fake.Files["/home/dev/.local/bin/claude"] = []byte("claude\n")
	fake.Replies["claude"] = "2.1.263 (Claude Code)\n"
	fake.Spawn(modtest.Proc{PID: 5200, PPID: 1, User: "dev", CPU: 1.5, RSS: 262144, Etimes: 30, Args: "/home/dev/.local/bin/codex exec"})

	fake.Files["/proc/meminfo"] = []byte("MemTotal:       4015000 kB\n")
	fake.Files[daemon.DefaultHostKeyPath] = []byte(hostKey + "\n")
	fake.Files["/root/.ssh/authorized_keys"] = []byte(trustedKey + " jordan@laptop\n")
	fake.Units["ssh"] = modtest.UnitActive
	fake.Files[sudo.Binary] = []byte("pupitred")
	fake.Modes[sudo.Binary] = 0o755
	fake.Files[sudo.Path] = []byte(sudo.Open)
	fake.Modes[sudo.Path] = 0o440
	fake.Files["/etc/shadow"] = []byte("root:*:20000:0:99999:7:::\ndev:!:20000:0:99999:7:::\n")
}

// A command that takes a secret line gets a session of its own, the way the app sends it.
func answer(t *testing.T, server *protocol.Server, tc answerCase) any {
	t.Helper()

	params := tc.params
	if params == nil {
		params = map[string]any{}
	}

	if tc.secret == "" {
		result, err := server.Call(tc.cmd, params, nil)
		if err != nil {
			t.Fatalf("%s: %v", tc.cmd, err)
		}

		return result
	}

	request, err := json.Marshal(map[string]any{"id": 2, "cmd": tc.cmd, "params": params})
	if err != nil {
		t.Fatal(err)
	}

	var out bytes.Buffer
	if err := server.Serve(strings.NewReader(helloLine+"\n"+string(request)+"\n"+tc.secret+"\n"), &out); err != nil {
		t.Fatalf("serve: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	response := decodeResponse(t, lines[len(lines)-1])
	if response["ok"] != true {
		t.Fatalf("%s: %s", tc.cmd, lines[len(lines)-1])
	}

	return response["result"]
}
