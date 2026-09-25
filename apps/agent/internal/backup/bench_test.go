package backup_test

import (
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/user"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"pupitre.studio/agent/internal/backup"
	"pupitre.studio/agent/internal/backup/seal"
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/migrate"
	"pupitre.studio/agent/internal/modules"
	module "pupitre.studio/agent/internal/modules/core/backup"
	"pupitre.studio/agent/internal/modules/db/postgres"
	"pupitre.studio/agent/internal/modules/db/redis"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/platform"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/s3"
	"pupitre.studio/agent/internal/s3/s3test"
	"pupitre.studio/agent/internal/state"
	"pupitre.studio/agent/internal/sys/env"
)

// The keys and salt the laptop derives from "correct horse battery staple".
const (
	privateKey = "3/kJOuP+i9Ij0TrB+P4qgR/v3lb1+P8Tc5eNFVeKsEk="
	recipient  = "A10gydBSR5g4m/L8q8Msuz7sSJNSPyytp4QgelrXxEw="
	salt       = "lneDgZnxLTb17pcdSfaKvA=="

	serverID       = "srv_42"
	bucketName     = "backups"
	secretKey      = s3test.Secret
	redisPassword  = "redis-password-of-the-bench"
	installPath    = "/etc/pupitre/install.json"
	ledgerPath     = "/etc/pupitre/migrations.json"
	serverIDPath   = "/etc/pupitre/server.id"
	pgDump         = "PGDMP custom dump of shop"
	pgRoles        = "CREATE ROLE reporting;"
	redisSnapshot  = "REDIS0011 snapshot"
	projectName    = "intranet"
	projectRepo    = "git@github.com:pupitre/intranet.git"
	runningWindows = `{"windows":["intranet/app"]}`
)

type platformFake struct {
	mu        sync.Mutex
	declared  []contract.BackupDeclaration
	forgotten []string
	down      bool
}

func (p *platformFake) serve(w http.ResponseWriter, r *http.Request) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.down {
		w.WriteHeader(http.StatusServiceUnavailable)

		return
	}

	switch {
	case r.Method == http.MethodPost && r.URL.Path == "/agent/backups":
		var declaration contract.BackupDeclaration
		_ = json.NewDecoder(r.Body).Decode(&declaration)
		p.declared = append(p.declared, declaration)
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"data":{}}`))
	case r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/agent/backups/"):
		p.forgotten = append(p.forgotten, strings.TrimPrefix(r.URL.Path, "/agent/backups/"))
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func (p *platformFake) declarations() []contract.BackupDeclaration {
	p.mu.Lock()
	defer p.mu.Unlock()

	return append([]contract.BackupDeclaration(nil), p.declared...)
}

type bench struct {
	t        *testing.T
	fake     *modtest.FakeSys
	bucket   *s3test.Fake
	platform *platformFake
	engine   *modules.Engine
	reader   *state.Reader
	service  *backup.Service
	home     string
	projects string
	staging  string
	logPath  string
	now      time.Time
	paths    registry.Paths
}

func newBench(t *testing.T, bucket *s3test.Fake) *bench {
	t.Helper()

	root := t.TempDir()

	b := &bench{
		t:        t,
		fake:     modtest.NewFakeSys(),
		bucket:   bucket,
		platform: &platformFake{},
		home:     filepath.Join(root, "home"),
		projects: filepath.Join(root, "home", "projects"),
		staging:  filepath.Join(root, "staging"),
		logPath:  filepath.Join(root, "pupitre.log"),
		now:      time.Date(2026, time.September, 24, 3, 0, 0, 0, time.UTC),
	}

	if err := os.MkdirAll(b.projects, 0o755); err != nil {
		t.Fatal(err)
	}

	server := httptest.NewServer(http.HandlerFunc(b.platform.serve))
	t.Cleanup(server.Close)

	catalog := modules.NewRegistry()
	catalog.Register(module.Module{})
	catalog.Register(postgres.Module{})
	catalog.Register(redis.Module{})

	b.engine = &modules.Engine{
		Registry:    catalog,
		Sys:         b.fake,
		Now:         modtest.NewClock(time.Millisecond).Now,
		Entitlement: func() contract.Entitlement { return contract.EntitlementDev },
		ReportPath:  filepath.Join(root, "report.json"),
		LogPath:     b.logPath,
		InstallPath: installPath,
		LockPath:    filepath.Join(root, "install.lock"),
	}

	b.paths = registry.Paths{Projects: b.projects}.Resolved()
	b.reader = state.FromEngine(b.engine, state.Options{Paths: b.paths})

	owner, err := user.Current()
	if err != nil {
		t.Fatal(err)
	}

	reach := bucket.Client(true)

	b.service = backup.New(backup.Options{
		Engine:  b.engine,
		Reader:  b.reader,
		Migrate: migrate.Options{Sys: b.fake, AgentVersion: "0.8.0-test", Paths: migrate.Paths{Install: installPath, Ledger: ledgerPath}},
		Platform: func() (platform.Client, error) {
			return platform.Client{BaseURL: server.URL, Token: "server-token"}, nil
		},
		AgentVersion: "0.8.0-test",
		Owner:        owner.Username,
		Now:          func() time.Time { return b.now },
		Location:     time.UTC,
		Paths: backup.Paths{
			State:    "/var/lib/pupitre/backup.json",
			Marker:   "/var/lib/pupitre/restore.json",
			Staging:  b.staging,
			ServerID: serverIDPath,
			Home:     b.home,
			Setup:    backup.Setup(installPath, b.paths.Local, b.paths.Conf, ledgerPath, env.Path, b.paths.Running),
		},
		Reach: func(client s3.Client) s3.Client {
			client.HTTP = reach.HTTP
			client.Backoff = reach.Backoff

			return client
		},
	})

	return b
}

func (b *bench) configured() *bench {
	b.t.Helper()

	endpoint := b.bucket.Client(true).Endpoint

	b.install(map[string]any{
		"modules": []string{"core.system", module.ID, postgres.ID, redis.ID},
		"config": map[string]any{
			module.ID: map[string]any{
				"endpoint": endpoint, "region": "auto", "bucket": bucketName, "prefix": "pupitre", "path_style": true,
				"access_key_id": s3test.AccessKey, "recipient": recipient, "kdf_salt": salt, "keep": 2,
				"extra_paths": []string{"notes"},
			},
			redis.ID: map[string]any{"persistence": false},
		},
		"secrets": map[string]any{
			module.ID: map[string]any{"secret_access_key": secretKey},
			redis.ID:  map[string]any{"password": redisPassword},
		},
	})

	b.fake.Files[serverIDPath] = []byte(serverID + "\n")
	b.fake.Files[ledgerPath] = []byte(`{"revision": 5, "applied": []}`)
	b.fake.Files[env.Path] = []byte("REDIS_PASSWORD=" + redisPassword + "\n")
	b.fake.Files[b.paths.Running] = []byte(runningWindows)
	b.fake.Files[b.paths.Local] = registryOf(projectName, projectRepo)
	b.fake.Packages["postgresql-17"] = "17.2"
	b.fake.Packages["redis-server"] = "7.0.15"

	b.databases()
	b.tree()

	return b
}

func (b *bench) install(document map[string]any) {
	b.t.Helper()

	encoded, err := json.Marshal(document)
	if err != nil {
		b.t.Fatal(err)
	}

	b.fake.Files[installPath] = encoded
}

func registryOf(name, repo string) []byte {
	return []byte(`{"projects":[{"name":"` + name + `","dir":"` + name + `","repo":"` + repo + `","boot":false,"runtimes":{},"processes":[{"id":"app","dir":".","pkgmgr":"bun","host":"127.0.0.1","port":3000,"routes":[],"cmd":"bun run dev"}]}]}`)
}

func (b *bench) databases() {
	b.fake.Answer("FROM pg_database", "shop\n")
	b.fake.Answer("pg_dump --format=custom --dbname=shop", pgDump)
	b.fake.Answer("pg_dumpall --roles-only", pgRoles)

	b.fake.Answer("CONFIG GET dir", "dir\n/var/lib/redis\n")
	b.fake.Answer("CONFIG GET dbfilename", "dbfilename\ndump.rdb\n")
	b.fake.Answer("LASTSAVE", "100\n")
	b.fake.Answer("BGSAVE", "Background saving started\n")
	b.fake.Answer("INFO persistence", "rdb_bgsave_in_progress:0\nrdb_last_bgsave_status:ok\n")
	b.fake.Answer("cat /var/lib/redis/dump.rdb", redisSnapshot)
}

func (b *bench) tree() {
	b.t.Helper()

	project := filepath.Join(b.projects, projectName)

	for rel, content := range map[string]string{
		".ssh/id_ed25519":                       "private key of dev",
		".ssh/authorized_keys":                  "the platform's own block",
		".claude.json":                          `{"session":"signed in"}`,
		".claude/settings.json":                 `{"model":"opus"}`,
		".claude/remote/ccd-cli/2.1.280":        "a binary Claude downloads again",
		"notes/todo.md":                         "- restore everything",
		"projects/intranet/src/a.ts":            "export const a = 1",
		"projects/intranet/.git/HEAD":           "ref: refs/heads/feature\n",
		"projects/intranet/.env.local":          "SECRET=1",
		"projects/intranet/node_modules/x/i.js": "rebuilt by bun install",
	} {
		write(b.t, filepath.Join(b.home, rel), content)
	}

	b.fake.Dirs[project] = true
	b.fake.Answer("rev-parse --show-toplevel", project+"\n\n")
	b.fake.Answer("rev-parse --abbrev-ref HEAD", "feature\n")
	b.fake.Answer("status --porcelain", " M src/a.ts\n?? draft.md\n")
	b.fake.Answer("rev-list --count HEAD --not --remotes", "2\n")
}

func write(t *testing.T, path, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func (b *bench) run(trigger string) contract.BackupRunResult {
	b.t.Helper()

	result, err := b.service.Run(nil, trigger, backup.Overrides{})
	if err != nil {
		b.t.Fatalf("run: %v", err)
	}

	return result
}

func (b *bench) secrets() contract.BackupSecrets {
	return contract.BackupSecrets{AccessKeyID: s3test.AccessKey, SecretAccessKey: secretKey, PrivateKey: privateKey}
}

func (b *bench) location() contract.BackupLocation {
	b.t.Helper()

	declared := b.platform.declarations()
	if len(declared) == 0 {
		b.t.Fatal("nothing was declared")
	}

	return declared[len(declared)-1].Location
}

func opened(t *testing.T, bucket *s3test.Fake, key string) []byte {
	t.Helper()

	sealed, found := bucket.Object(key)
	if !found {
		t.Fatalf("%s is not in the bucket", key)
	}

	private, _ := base64.StdEncoding.DecodeString(privateKey)
	reader, err := seal.NewReader(bytes.NewReader(sealed), private)
	if err != nil {
		t.Fatal(err)
	}

	unzipped, err := gzip.NewReader(reader)
	if err != nil {
		t.Fatal(err)
	}

	plain, err := io.ReadAll(unzipped)
	if err != nil {
		t.Fatal(err)
	}

	return plain
}

func partNamed(parts []contract.BackupPart, key string) (contract.BackupPart, bool) {
	for _, part := range parts {
		if part.Key == key {
			return part, true
		}
	}

	return contract.BackupPart{}, false
}
