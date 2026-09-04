package main

import (
	"fmt"
	"io"
	"os"

	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/core"
	_ "pupitre.studio/agent/internal/modules/runtime"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys"
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
	}

	usage(stderr)
	return 2
}

func usage(stderr io.Writer) {
	fmt.Fprintln(stderr, "usage: pupitred <serve|install [--only=id,id] [--skip=id,id]|report|version>")
}

func newServer(engine *modules.Engine) *protocol.Server {
	server := protocol.NewServer(protocol.Options{
		AgentVersion: version,
		Entitlement:  entitlement.Current(),
	})
	modules.RegisterCommands(server, engine)
	core.RegisterCommands(server, engine)

	return server
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
