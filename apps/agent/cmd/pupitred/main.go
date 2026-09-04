package main

import (
	"fmt"
	"io"
	"os"
	"time"

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
	"pupitre.studio/agent/internal/probe"
	"pupitre.studio/agent/internal/protocol"
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
	fmt.Fprintln(stderr, "usage: pupitred <serve|install [--only=id,id] [--skip=id,id]|probe [--script] [--projects=DIR]|report|dev|shot|gallery|version>")
}

func newServer(engine *modules.Engine) *protocol.Server {
	server := protocol.NewServer(protocol.Options{
		AgentVersion: version,
		Entitlement:  entitlement.Current(),
	})
	modules.RegisterCommands(server, engine)
	core.RegisterCommands(server, engine)
	db.RegisterCommands(server, engine)
	exposure.RegisterCommands(server, engine)
	tool.RegisterCommands(server, engine)
	probe.RegisterCommands(server, probeOptions(engine))
	state.RegisterCommands(server, state.FromEngine(engine, stateOptions()).WithJournal(engine.LogPath))

	return server
}

// The pause between the C-c and the kill leaves a dev server the time to close its port; nothing else waits.
func stateOptions() state.Options {
	return state.Options{Tmux: tmux.Options{Grace: 400 * time.Millisecond}}
}

func probeOptions(engine *modules.Engine) probe.Options {
	return probe.Options{Sys: engine.Sys, Version: engine.AgentVersion}
}

func newEngine() *modules.Engine {
	return &modules.Engine{
		Registry:     modules.Default(),
		Sys:          newSys(),
		Entitlement:  entitlement.Current,
		AgentVersion: version,
		ReportPath:   pathFromEnv("PUPITRE_REPORT_PATH", modules.DefaultReportPath),
		LogPath:      pathFromEnv("PUPITRE_LOG_PATH", modules.DefaultLogPath),
		InstallPath:  pathFromEnv("PUPITRE_INSTALL_PATH", modules.DefaultInstallPath),
	}
}

func pathFromEnv(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}

	return fallback
}
