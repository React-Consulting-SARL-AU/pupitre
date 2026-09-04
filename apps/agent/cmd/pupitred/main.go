package main

import (
	"fmt"
	"io"
	"os"
	"time"

	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/core"
	"pupitre.studio/agent/internal/modules/db"
	_ "pupitre.studio/agent/internal/modules/runtime"
	"pupitre.studio/agent/internal/probe"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/state"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/tmux"
)

var version = "dev"

const secretsDescriptor = 3

var newSys = func() sys.Sys { return sys.Real{} }

func main() {
	os.Exit(run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr))
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
		if err := newServer(newEngine()).Serve(stdin, stdout, secretStream()); err != nil {
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
	}

	usage(stderr)
	return 2
}

func usage(stderr io.Writer) {
	fmt.Fprintln(stderr, "usage: pupitred <serve|install [--only=id,id] [--skip=id,id]|probe [--script] [--projects=DIR]|report|version>")
}

func newServer(engine *modules.Engine) *protocol.Server {
	server := protocol.NewServer(protocol.Options{
		AgentVersion: version,
		Entitlement:  entitlement.Current(),
	})
	modules.RegisterCommands(server, engine)
	core.RegisterCommands(server, engine)
	db.RegisterCommands(server, engine)
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

func secretStream() io.Reader {
	file := os.NewFile(secretsDescriptor, "secrets")
	if file == nil {
		return nil
	}

	if _, err := file.Stat(); err != nil {
		return nil
	}

	return file
}
