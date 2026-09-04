//go:build staging

package staging

import (
	"fmt"
	"net"
	"os/exec"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
)

const (
	dbSecret  = "s3cret-de-staging"
	dumpFile  = "/home/dev/dumps/fulldump_shop_20260101.sql"
	dumpTable = "CREATE TABLE article (id INT PRIMARY KEY, titre VARCHAR(120));"
)

var dbInstall = request{Cmd: "install", Params: map[string]any{
	"modules":       []string{"db.mysql", "db.postgres", "db.mongodb"},
	"secrets_stdin": true,
	"config": map[string]any{
		"core.system": map[string]any{"timezone": "Europe/Paris", "git_name": "Pupitre Staging", "git_email": "staging@pupitre.studio"},
		"db.mysql":    map[string]any{"engine": "mysql"},
	},
}}

var dbSecrets = fmt.Sprintf(
	`{"db.mysql":{"app_password":%q,"remote_password":%q},"db.postgres":{"app_password":%q,"remote_password":%q},"db.mongodb":{"app_password":%q}}`,
	dbSecret, dbSecret, dbSecret, dbSecret, dbSecret,
)

var ports = map[string]int{"mysql": 3306, "postgres": 5432, "mongodb": 27017}

// The dump has to be there before the engines are, which is the whole point of ~/dumps.
func installDatabases(t *testing.T, host string) response {
	t.Helper()

	dev := "dev@" + address(host)
	ssh(t, dev, "mkdir", "-p", "/home/dev/dumps")

	seed := sshCommand(dev, "sh", "-c", "'cat > "+dumpFile+"'")
	seed.Stdin = strings.NewReader(dumpTable + "\n")
	if out, err := seed.CombinedOutput(); err != nil {
		t.Fatalf("seeding %s: %v\n%s", dumpFile, err, out)
	}

	return agentWithSecrets(t, host, dbSecrets, dbInstall)[0]
}

func TestDatabasesListenOnTheLoopbackOnly(t *testing.T) {
	host := stagingHost(t)

	result := decode[contract.InstallResult](t, installDatabases(t, host).Result)
	if len(result.Failed) != 0 {
		t.Fatalf("install failed: %v", result.Failed)
	}

	listening := ssh(t, host, "ss", "-ltn")
	for engine, port := range ports {
		if !strings.Contains(listening, fmt.Sprintf("127.0.0.1:%d", port)) {
			t.Errorf("%s must answer on the loopback:\n%s", engine, listening)
		}

		for _, open := range []string{"0.0.0.0:%d", "*:%d", "[::]:%d"} {
			if strings.Contains(listening, fmt.Sprintf(open, port)) {
				t.Errorf("%s listens beyond the loopback:\n%s", engine, listening)
			}
		}
	}

	if conf := ssh(t, host, "sudo", "cat", "/etc/mysql/conf.d/99-pupitre.cnf"); !strings.Contains(conf, "bind-address                   = 127.0.0.1") {
		t.Errorf("the mysql configuration must bind the loopback:\n%s", conf)
	}

	if conf := ssh(t, host, "sudo", "cat", "/etc/postgresql/17/main/conf.d/99-pupitre.conf"); !strings.Contains(conf, "listen_addresses = '127.0.0.1'") {
		t.Errorf("the postgres configuration must bind the loopback:\n%s", conf)
	}

	if conf := ssh(t, host, "sudo", "cat", "/etc/mongod.conf"); !strings.Contains(conf, "bindIp: 127.0.0.1") {
		t.Errorf("the mongodb configuration must bind the loopback:\n%s", conf)
	}
}

func TestADumpLeftBeforeTheInstallIsImportedAndReported(t *testing.T) {
	host := stagingHost(t)

	report := agent(t, host, request{Cmd: "report"})[0]
	if !strings.Contains(string(report.Result), `"step":"import-shop"`) {
		t.Fatalf("the report must name the imported database:\n%s", report.Result)
	}

	tables := ssh(t, host, "sudo", "mysql", "-N", "-B", "-e",
		"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'shop'")
	if strings.TrimSpace(tables) == "0" {
		t.Fatalf("the dump must have reached the shop database: %q", tables)
	}
}

func TestDbUrlIsUsableThroughAnSshForward(t *testing.T) {
	host := stagingHost(t)

	for engine, port := range ports {
		answers := agent(t, host, request{Cmd: "db.url", Params: map[string]any{"engine": engine}})[0]
		url := decode[struct {
			URL string `json:"url"`
		}](t, answers.Result).URL

		if !strings.Contains(url, fmt.Sprintf("@127.0.0.1:%d/", port)) {
			t.Errorf("%s: %q must point at the forwarded loopback port", engine, url)
		}

		if strings.Contains(url, dbSecret) {
			t.Fatalf("%s: an url carries no password: %q", engine, url)
		}

		local := port + 10000
		stop := forward(t, host, local, port)
		conn, err := dial(local)
		stop()
		if err != nil {
			t.Errorf("%s: nothing answers through ssh -L %d:127.0.0.1:%d: %v", engine, local, port, err)
			continue
		}
		conn.Close()
	}
}

// ssh -L is the only way in: the app opens it, the url above is what the client pastes at the other end.
func forward(t *testing.T, host string, local, remote int) func() {
	t.Helper()

	cmd := exec.Command("ssh", "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes", "-N",
		"-L", fmt.Sprintf("127.0.0.1:%d:127.0.0.1:%d", local, remote), host)
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}

	return func() {
		cmd.Process.Kill()
		cmd.Wait()
	}
}

func dial(port int) (net.Conn, error) {
	var err error
	for range 20 {
		var conn net.Conn
		conn, err = net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), time.Second)
		if err == nil {
			return conn, nil
		}

		time.Sleep(250 * time.Millisecond)
	}

	return nil, err
}

func TestNoGeneratedPasswordLeavesTheEnvFile(t *testing.T) {
	host := stagingHost(t)

	keys := ssh(t, host, "sudo", "cat", "/etc/pupitre/env")
	for _, key := range []string{"MYSQL_APP_PASSWORD", "MYSQL_REMOTE_PASSWORD", "POSTGRES_APP_PASSWORD", "POSTGRES_REMOTE_PASSWORD", "MONGODB_APP_PASSWORD"} {
		if !strings.Contains(keys, key+"=") {
			t.Errorf("%s must be stored in /etc/pupitre/env", key)
		}
	}

	if mode := ssh(t, host, "sudo", "stat", "-c", "%a %U", "/etc/pupitre/env"); strings.TrimSpace(mode) != "600 root" {
		t.Errorf("/etc/pupitre/env = %q, want 600 root", strings.TrimSpace(mode))
	}

	report := agent(t, host, request{Cmd: "report"})[0]
	if strings.Contains(string(report.Result), dbSecret) {
		t.Error("a password leaked into the report")
	}

	if journal := ssh(t, host, "sudo", "cat", "/var/log/pupitre.log"); strings.Contains(journal, dbSecret) {
		t.Error("a password leaked into /var/log/pupitre.log")
	}

	if installed := ssh(t, host, "sudo", "stat", "-c", "%a", "/etc/pupitre/install.json"); strings.TrimSpace(installed) != "600" {
		t.Errorf("/etc/pupitre/install.json = %q, want 600", strings.TrimSpace(installed))
	}
}

func TestReplayingTheDatabasesChangesNothing(t *testing.T) {
	host := stagingHost(t)

	var replay response
	elapsed := timed(t, "database install replay", func() {
		replay = agentWithSecrets(t, host, dbSecrets, dbInstall)[0]
	})

	if changed := steps(replay, contract.StepOK); len(changed) != 0 || elapsed > 30*time.Second {
		t.Fatalf("replay must only skip in under 30 s: %v in %s", changed, elapsed)
	}

	if imported := decode[contract.InstallResult](t, replay.Result); len(imported.Failed) != 0 {
		t.Fatalf("replay failed: %v", imported.Failed)
	}
}
