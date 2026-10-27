package main

import (
	"fmt"
	"io"
	"time"

	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/mcp"
	"pupitre.studio/agent/internal/modules"
)

const (
	mcpCommand = "mcp"
	mcpName    = "pupitre"
)

// The AI agent launches it as dev over stdio: the same limited session as dev's verbs, and no listener.
func runMCP(engine *modules.Engine, stdin io.Reader, stdout, stderr io.Writer) int {
	local := func() devcli.Caller { return newServer(engine, false) }

	agent, err := devcli.RealElevation(engine.Sys, tokenPath(), licensePath()).Caller(local, version)
	if err != nil {
		agent = unreachable{err: err}
	}

	if remote, isRemote := agent.(*devcli.Remote); isRemote {
		defer remote.Close()
	}

	toolbox := mcp.Toolbox{Agent: agent, Sleep: time.Sleep, Now: time.Now}

	server := mcp.Server{Name: mcpName, Version: version, Instructions: mcp.Instructions, Tools: toolbox.Tools()}

	if err := server.Serve(stdin, stdout); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	return 0
}

// A server that cannot reach the agent still starts: each tool then answers why, where the model reads it.
type unreachable struct {
	err error
}

func (u unreachable) Call(string, any, func(string, map[string]any)) (any, error) {
	return nil, u.err
}
