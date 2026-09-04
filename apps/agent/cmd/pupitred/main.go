package main

import (
	"fmt"
	"io"
	"os"
	"time"

	"pupitre.studio/agent/internal/daemon"
	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/entitlement"
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

	switch args[0] {
	case "version":
		fmt.Fprintln(stdout, "pupitred "+version)
		return 0
	case "serve":
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
		return runInstall(newEngine(), args[1:], stderr)
	case "report":
		return runReport(newEngine(), stdout, stderr)
	case "probe":
		return runProbe(probeOptions(newEngine()), args[1:], stdout, stderr)
	case devcli.Command:
		return devcli.Run(devcli.Options{Server: newServer(newEngine()), Tmux: stateOptions().Tmux}, args[1:], stdout, stderr)
	case shots.Command:
		return runShot(state.FromEngine(newEngine(), stateOptions()), args[1:], stdout, stderr)
	case "gallery":
		return runGallery(args[1:], stderr)
	}

	usage(stderr)
	return 2
}

func usage(stderr io.Writer) {
	fmt.Fprintln(stderr, "usage: pupitred <serve|daemon|enroll|install [--only=id,id] [--skip=id,id]|probe [--script] [--projects=DIR]|report|dev|shot|gallery|version>")
}

func newServer(engine *modules.Engine) *protocol.Server {
	server := protocol.NewServer(protocol.Options{
		AgentVersion: version,
		Entitlement:  newResolver(engine).State,
	})
	modules.RegisterCommands(server, engine)
	core.RegisterCommands(server, engine)
	db.RegisterCommands(server, engine)
	exposure.RegisterCommands(server, engine)
	tool.RegisterCommands(server, engine)
	probe.RegisterCommands(server, probeOptions(engine))
	selfupdate.RegisterCommands(server, upgradeOptions(engine))
	daemon.RegisterCommands(server, daemonOptions(engine))
	state.RegisterCommands(server, state.FromEngine(engine, stateOptions()).WithJournal(engine.LogPath))

	return server
}

// The pause between the C-c and the kill leaves a dev server the time to close its port; nothing else waits.
func stateOptions() state.Options {
	return state.Options{Tmux: tmux.Options{Grace: 400 * time.Millisecond}}
}

func newDaemon(engine *modules.Engine) *daemon.Daemon {
	options := daemonOptions(engine)
	options.Reader = state.FromEngine(engine, stateOptions()).WithJournal(engine.LogPath)

	return daemon.New(options)
}

func daemonOptions(engine *modules.Engine) daemon.Options {
	return daemon.Options{
		Sys:          engine.Sys,
		Entitlement:  newResolver(engine),
		AgentVersion: version,
		TokenPath:    pathFromEnv("PUPITRE_TOKEN_PATH", platform.DefaultTokenPath),
		KeysPath:     pathFromEnv("PUPITRE_KEYS_PATH", daemon.DefaultKeysPath),
		HostKeyPath:  pathFromEnv("PUPITRE_HOST_KEY_PATH", daemon.DefaultHostKeyPath),
		LogPath:      engine.LogPath,
		Platform:     platform.Client{BaseURL: os.Getenv("PUPITRE_PLATFORM_URL")},
	}
}

func newResolver(engine *modules.Engine) *entitlement.Resolver {
	return entitlement.New(entitlement.Options{
		Sys:       engine.Sys,
		CachePath: pathFromEnv("PUPITRE_ENTITLEMENT_PATH", entitlement.DefaultCachePath),
		TokenPath: pathFromEnv("PUPITRE_TOKEN_PATH", platform.DefaultTokenPath),
	})
}

func upgradeOptions(engine *modules.Engine) selfupdate.Options {
	return selfupdate.Options{
		Sys:        engine.Sys,
		Version:    version,
		BinaryPath: pathFromEnv("PUPITRE_BINARY_PATH", selfupdate.DefaultBinaryPath),
		TokenPath:  pathFromEnv("PUPITRE_TOKEN_PATH", platform.DefaultTokenPath),
		LogPath:    engine.LogPath,
		Platform:   platform.Client{BaseURL: os.Getenv("PUPITRE_PLATFORM_URL")},
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
	}
	engine.Entitlement = newResolver(engine).Current

	return engine
}

func pathFromEnv(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}

	return fallback
}
