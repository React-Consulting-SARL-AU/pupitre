package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"
	"time"

	"pupitre.studio/agent/internal/backup"
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/daemon"
	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/migrate"
	"pupitre.studio/agent/internal/modules"
	_ "pupitre.studio/agent/internal/modules/ai"
	"pupitre.studio/agent/internal/modules/core"
	"pupitre.studio/agent/internal/modules/db"
	_ "pupitre.studio/agent/internal/modules/editor"
	"pupitre.studio/agent/internal/modules/exposure"
	_ "pupitre.studio/agent/internal/modules/runtime"
	"pupitre.studio/agent/internal/modules/tool"
	"pupitre.studio/agent/internal/platform"
	"pupitre.studio/agent/internal/probe"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/selfupdate"
	"pupitre.studio/agent/internal/shots"
	"pupitre.studio/agent/internal/state"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/tmux"
)

var version = "dev"

var newSys = func() sys.Sys { return sys.Real{} }

func main() {
	os.Exit(run(arguments(os.Args), os.Stdin, os.Stdout, os.Stderr))
}

func run(args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	if len(args) < 1 {
		usage(stderr)
		return 2
	}

	// A protocol session states its language in hello; a terminal states it through its shell.
	if args[0] != "serve" {
		i18n.FromEnv(os.Getenv)
	}

	switch args[0] {
	case "version":
		if len(args) > 1 && args[1] == "--json" {
			return printIdentity(stdout)
		}

		fmt.Fprintln(stdout, "pupitred "+version)
		return 0
	case migrate.Command:
		return runMigrate(newMigrator(newEngine()), args[1:], stdout, stderr)
	case "serve":
		limited, known := serveMode(args[1:])
		if !known {
			usage(stderr)
			return 2
		}

		// A dropped channel ends the session, not the command: the write fails and the work goes on.
		signal.Ignore(syscall.SIGPIPE, syscall.SIGHUP)

		if err := newServer(newEngine(), limited).Serve(stdin, stdout); err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}

		return 0
	case "daemon":
		return runDaemon(newDaemon(newEngine()), stderr)
	case "enroll":
		return runEnroll(newDaemon(newEngine()), stdin, stderr)
	case "install":
		engine := newEngine()
		migrator := newMigrator(engine)

		brought(migrator, engine)
		return runInstall(engine, migrator.State(), args[1:], stderr)
	case "report":
		return runReport(newEngine(), stdout, stderr)
	case "probe":
		return runProbe(probeOptions(newEngine()), args[1:], stdout, stderr)
	case devcli.Command:
		return runDev(newEngine(), args[1:], stdout, stderr)
	case shots.Command:
		return runShot(state.FromEngine(newEngine(), stateOptions()), args[1:], stdout, stderr)
	case "resume":
		engine := newEngine()
		migrator := newMigrator(engine)

		brought(migrator, engine)
		return runResume(state.FromEngine(engine, stateOptions()), migrator.State(), stdout)
	case "gallery":
		return runGallery(args[1:], stderr)
	case "backup":
		return runBackup(args[1:], stdin, stdout, stderr)
	case "binary":
		engine := newEngine()
		options := upgradeOptions(engine, newMigrator(engine))

		return runBinary(selfupdate.New(options), options.BinaryPath, args[1:], stdin, stdout, stderr)
	case keysCommand:
		return runKeys(newEngine(), args[1:], stdout, stderr)
	}

	usage(stderr)
	return 2
}

func usage(stderr io.Writer) {
	fmt.Fprintln(stderr, "usage: pupitred <serve [--privileged]|daemon|enroll|install [--only=id,id] [--skip=id,id]|migrate [--status] [--restore=NAME]|probe [--script] [--projects=DIR]|report|resume|dev|shot|gallery|backup open [--salt=B64|--private-key] FILE|keys reset --key KEY|FILE.pub|binary install [--privileged] [--allow-downgrade] < HEADER+FILE|version [--json]>")
}

// The agent that upgrades to this binary asks it which protocol to greet it in.
func printIdentity(stdout io.Writer) int {
	encoded, err := json.Marshal(selfupdate.Identity{Version: version, Protocol: contract.ProtocolVersion})
	if err != nil {
		return 1
	}

	fmt.Fprintln(stdout, string(encoded))

	return 0
}

// sudo runs exactly `pupitred serve` without a password (decision 0015): that line is the limited session, any other is refused.
func serveMode(args []string) (limited, known bool) {
	switch {
	case len(args) == 0:
		return true, true
	case len(args) == 1 && args[0] == "--privileged":
		return false, true
	}

	return false, false
}

// Migrates before any read; a machine already at the revision answers without a lock, as every extra channel does.
func newServer(engine *modules.Engine, limited bool) *protocol.Server {
	migrator := newMigrator(engine)
	brought(migrator, engine)

	reader := state.FromEngine(engine, stateOptions()).WithJournal(engine.LogPath)
	backups := newBackups(engine, reader)

	server := protocol.NewServer(protocol.Options{
		AgentVersion: version,
		Config:       migrator.State,
		Entitlement:  newResolver(engine).State,
		ServerID:     backups.ServerID,
		Limited:      limited,
	})

	modules.RegisterCommands(server, engine)
	core.RegisterCommands(server, engine)
	db.RegisterCommands(server, engine)
	exposure.RegisterCommands(server, engine)
	tool.RegisterCommands(server, engine)
	probe.RegisterCommands(server, probeOptions(engine))
	selfupdate.RegisterCommands(server, upgradeOptions(engine, migrator))
	migrate.RegisterCommands(server, migrator)
	daemon.RegisterCommands(server, daemonOptions(engine))
	state.RegisterCommands(server, reader)
	backup.RegisterCommands(server, backups)

	return server
}

func newBackups(engine *modules.Engine, reader *state.Reader) *backup.Service {
	projects := stateOptions().Paths.Resolved()
	ledger := pathFromEnv("PUPITRE_LEDGER_PATH", migrate.DefaultLedger)

	return backup.New(backup.Options{
		Engine:       engine,
		Reader:       reader,
		Migrate:      migrateOptions(engine),
		Platform:     storedPlatform(engine),
		AgentVersion: version,
		Paths: backup.Paths{
			State:    pathFromEnv("PUPITRE_BACKUP_STATE_PATH", backup.DefaultStatePath),
			Marker:   pathFromEnv("PUPITRE_RESTORE_MARKER_PATH", backup.DefaultMarkerPath),
			Staging:  pathFromEnv("PUPITRE_RESTORE_STAGING_PATH", backup.DefaultStagingPath),
			ServerID: serverIDPath(),
			Home:     pathFromEnv("PUPITRE_HOME", backup.DefaultHome),
			Setup:    backup.Setup(engine.InstallPath, projects.Local, projects.Conf, ledger, env.Path, projects.Running),
		},
	})
}

func storedPlatform(engine *modules.Engine) func() (platform.Client, error) {
	return func() (platform.Client, error) {
		return platform.Stored(engine.Sys, platform.Client{BaseURL: os.Getenv("PUPITRE_PLATFORM_URL"), Version: version}, tokenPath(), "")
	}
}

func serverIDPath() string {
	return pathFromEnv("PUPITRE_SERVER_ID_PATH", platform.DefaultServerIDPath)
}

// The grace between C-c and the kill lets a dev server close its port.
func stateOptions() state.Options {
	return state.Options{
		Tmux: tmux.Options{Grace: 400 * time.Millisecond},
		Paths: registry.Paths{
			Backups: pathFromEnv("PUPITRE_BACKUPS_PATH", migrate.DefaultBackups),
			Lock:    projectsLockPath(),
		},
		InstallLock: pathFromEnv("PUPITRE_PROJECT_INSTALL_LOCK_PATH", state.DefaultInstallLock),
	}
}

// One lock for every writer of the registry: project.add in the state reader, a domain move in the exposure module.
func projectsLockPath() string {
	return pathFromEnv("PUPITRE_PROJECTS_LOCK_PATH", registry.DefaultLock)
}

func newDaemon(engine *modules.Engine) *daemon.Daemon {
	brought(newMigrator(engine), engine)

	options := daemonOptions(engine)
	options.Reader = state.FromEngine(engine, stateOptions()).WithJournal(engine.LogPath)
	options.Backups = newBackups(engine, options.Reader)

	return daemon.New(options)
}

func daemonOptions(engine *modules.Engine) daemon.Options {
	return daemon.Options{
		Sys:          engine.Sys,
		Entitlement:  newResolver(engine),
		AgentVersion: version,
		TokenPath:    tokenPath(),
		ServerIDPath: serverIDPath(),
		KeysPath:     keysPath(),
		SignersPath:  signersPath(),
		KeysLock:     keysLockPath(),
		Euid:         effectiveUID,
		HostKeyPath:  pathFromEnv("PUPITRE_HOST_KEY_PATH", daemon.DefaultHostKeyPath),
		LogPath:      engine.LogPath,
		Platform:     platform.Client{BaseURL: os.Getenv("PUPITRE_PLATFORM_URL"), Version: version},
	}
}

func newResolver(engine *modules.Engine) *entitlement.Resolver {
	return entitlement.New(entitlement.Options{
		Sys:       engine.Sys,
		CachePath: entitlementPath(),
		TokenPath: tokenPath(),
	})
}

func tokenPath() string {
	return pathFromEnv("PUPITRE_TOKEN_PATH", platform.DefaultTokenPath)
}

func entitlementPath() string {
	return pathFromEnv("PUPITRE_ENTITLEMENT_PATH", entitlement.DefaultCachePath)
}

func upgradeOptions(engine *modules.Engine, migrator *migrate.Runner) selfupdate.Options {
	return selfupdate.Options{
		Sys:         engine.Sys,
		Version:     version,
		BinaryPath:  pathFromEnv("PUPITRE_BINARY_PATH", selfupdate.DefaultBinaryPath),
		TokenPath:   tokenPath(),
		LogPath:     engine.LogPath,
		Platform:    platform.Client{BaseURL: os.Getenv("PUPITRE_PLATFORM_URL"), Version: version},
		Migrator:    migrator,
		UpgradeLock: pathFromEnv("PUPITRE_UPGRADE_LOCK_PATH", selfupdate.DefaultLockPath),
		InstallLock: engine.LockPath,
	}
}

func probeOptions(engine *modules.Engine) probe.Options {
	return probe.Options{Sys: engine.Sys, Version: engine.AgentVersion}
}

func newEngine() *modules.Engine {
	engine := &modules.Engine{
		Registry:     modules.Default(),
		Sys:          newSys(),
		AgentVersion: version,
		ReportPath:   pathFromEnv("PUPITRE_REPORT_PATH", modules.DefaultReportPath),
		LogPath:      pathFromEnv("PUPITRE_LOG_PATH", modules.DefaultLogPath),
		InstallPath:  pathFromEnv("PUPITRE_INSTALL_PATH", modules.DefaultInstallPath),
		LockPath:     pathFromEnv("PUPITRE_LOCK_PATH", modules.DefaultLockPath),
	}
	engine.ProjectsLockPath = projectsLockPath()
	engine.Entitlement = newResolver(engine).Current

	return engine
}

func newMigrator(engine *modules.Engine) *migrate.Runner {
	return migrate.New(migrateOptions(engine))
}

func migrateOptions(engine *modules.Engine) migrate.Options {
	return migrate.Options{
		AgentVersion: version,
		Logf:         journalOf(engine),
		Paths: migrate.Paths{
			Install: engine.InstallPath,
			Ledger:  pathFromEnv("PUPITRE_LEDGER_PATH", migrate.DefaultLedger),
			Backups: pathFromEnv("PUPITRE_BACKUPS_PATH", migrate.DefaultBackups),
			Lock:    engine.LockPath,
			Keys:    keysPath(),
			Signers: signersPath(),
		},
		Sys: engine.Sys,
	}
}

// A refused migration never stops the agent, or nobody could repair the server; the protocol refuses per command.
func brought(migrator *migrate.Runner, engine *modules.Engine) {
	result, err := migrator.Run()
	if err != nil {
		journalOf(engine)("configuration migration could not run: %s", err)

		return
	}

	if len(result.Applied) > 0 {
		journalOf(engine)("configuration migrated to revision %d", result.Revision)
	}

	if result.Failure != nil {
		journalOf(engine)("configuration migration %d (%s) refused: %s", result.Failure.ID, result.Failure.Slug, result.Failure.Message)
	}
}

func journalOf(engine *modules.Engine) func(string, ...any) {
	return modules.NewContext(modules.ContextOptions{
		Sys:      engine.Sys,
		Manifest: contract.Manifest{ID: "pupitred"},
		LogPath:  engine.LogPath,
	}).Logf
}

func pathFromEnv(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}

	return fallback
}
