package main

import (
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"
	"time"

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

	// A terminal states its language through its shell; a protocol session states it in hello.
	if args[0] != "serve" {
		i18n.FromEnv(os.Getenv)
	}

	switch args[0] {
	case "version":
		fmt.Fprintln(stdout, "pupitred "+version)
		return 0
	case migrate.Command:
		return runMigrate(newMigrator(newEngine()), args[1:], stdout, stderr)
	case "serve":
		// A channel that drops takes the session, not the command: the write
		// fails, the work goes on, and the report says where it got to.
		signal.Ignore(syscall.SIGPIPE, syscall.SIGHUP)
		if err := newServer(newEngine()).Serve(stdin, stdout); err != nil {
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
	}

	usage(stderr)
	return 2
}

func usage(stderr io.Writer) {
	fmt.Fprintln(stderr, "usage: pupitred <serve|daemon|enroll|install [--only=id,id] [--skip=id,id]|migrate [--status] [--restore=NAME]|probe [--script] [--projects=DIR]|report|resume|dev|shot|gallery|version>")
}

// The configuration is brought to this binary's shape before the binary reads
// any of it. Nothing waits on a lock for it: a machine already at the revision
// answers on one read of a small file, which is what every second channel of an
// install under way does.
func newServer(engine *modules.Engine) *protocol.Server {
	migrator := newMigrator(engine)
	brought(migrator, engine)

	server := protocol.NewServer(protocol.Options{
		AgentVersion: version,
		Config:       migrator.State,
		Entitlement:  newResolver(engine).State,
	})
	modules.RegisterCommands(server, engine)
	core.RegisterCommands(server, engine)
	db.RegisterCommands(server, engine)
	exposure.RegisterCommands(server, engine)
	tool.RegisterCommands(server, engine)
	probe.RegisterCommands(server, probeOptions(engine))
	selfupdate.RegisterCommands(server, upgradeOptions(engine))
	migrate.RegisterCommands(server, migrator)
	daemon.RegisterCommands(server, daemonOptions(engine))
	state.RegisterCommands(server, state.FromEngine(engine, stateOptions()).WithJournal(engine.LogPath))

	return server
}

// The pause between the C-c and the kill leaves a dev server the time to close its port; nothing else waits.
func stateOptions() state.Options {
	return state.Options{
		Tmux: tmux.Options{Grace: 400 * time.Millisecond},
		Paths: registry.Paths{
			Backups: pathFromEnv("PUPITRE_BACKUPS_PATH", migrate.DefaultBackups),
			Lock:    projectsLockPath(),
		},
	}
}

// One lock for the registry, whoever rewrites it: the state reader on a project.add, the exposure module on a domain move.
func projectsLockPath() string {
	return pathFromEnv("PUPITRE_PROJECTS_LOCK_PATH", registry.DefaultLock)
}

func newDaemon(engine *modules.Engine) *daemon.Daemon {
	brought(newMigrator(engine), engine)

	options := daemonOptions(engine)
	options.Reader = state.FromEngine(engine, stateOptions()).WithJournal(engine.LogPath)

	return daemon.New(options)
}

func daemonOptions(engine *modules.Engine) daemon.Options {
	return daemon.Options{
		Sys:          engine.Sys,
		Entitlement:  newResolver(engine),
		AgentVersion: version,
		TokenPath:    tokenPath(),
		KeysPath:     pathFromEnv("PUPITRE_KEYS_PATH", daemon.DefaultKeysPath),
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

// What the entitlement is resolved from, and what an account that cannot read it has to become root for.
func tokenPath() string {
	return pathFromEnv("PUPITRE_TOKEN_PATH", platform.DefaultTokenPath)
}

func entitlementPath() string {
	return pathFromEnv("PUPITRE_ENTITLEMENT_PATH", entitlement.DefaultCachePath)
}

func upgradeOptions(engine *modules.Engine) selfupdate.Options {
	return selfupdate.Options{
		Sys:        engine.Sys,
		Version:    version,
		BinaryPath: pathFromEnv("PUPITRE_BINARY_PATH", selfupdate.DefaultBinaryPath),
		TokenPath:  tokenPath(),
		LogPath:    engine.LogPath,
		Platform:   platform.Client{BaseURL: os.Getenv("PUPITRE_PLATFORM_URL"), Version: version},
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
	return migrate.New(migrate.Options{
		AgentVersion: version,
		Logf:         journalOf(engine),
		Paths: migrate.Paths{
			Install: engine.InstallPath,
			Ledger:  pathFromEnv("PUPITRE_LEDGER_PATH", migrate.DefaultLedger),
			Backups: pathFromEnv("PUPITRE_BACKUPS_PATH", migrate.DefaultBackups),
			Lock:    engine.LockPath,
		},
		Sys: engine.Sys,
	})
}

// A migration that refuses does not stop the agent from starting: a server
// nobody can look at is a server nobody can repair. It stops every command that
// would read a shape this binary does not understand, which the protocol says
// on its own.
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
