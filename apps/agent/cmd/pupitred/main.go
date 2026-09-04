package main

import (
	"fmt"
	"io"
	"os"

	"pupitre.sh/agent/internal/entitlement"
	"pupitre.sh/agent/internal/protocol"
)

var version = "dev"

const secretsDescriptor = 3

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	switch os.Args[1] {
	case "version":
		fmt.Println("pupitred " + version)
	case "serve":
		if err := newServer().Serve(os.Stdin, os.Stdout, secretStream()); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	default:
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: pupitred <serve|version>")
}

func newServer() *protocol.Server {
	return protocol.NewServer(protocol.Options{
		AgentVersion: version,
		Entitlement:  entitlement.Current(),
	})
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
