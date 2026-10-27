package agents

import (
	"encoding/json"
	"errors"
	"slices"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sudo"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	MCPName       = "pupitre"
	MCPSubcommand = "mcp"
)

// The client's own CLI writes its configuration: the file is the client's, and its format moves with its releases.
type MCP struct {
	CLI string
	// Relative to dev's home, read through os.Root.
	Config string
	// The settings whose permissions.allow lets the tools run without a prompt; empty for a client without that list.
	Settings string

	add        func(server Server) []string
	remove     func(name string) []string
	registered func(config []byte, server Server) bool
}

// A stdio MCP server as a client declares it: a name, then the command that starts it.
type Server struct {
	Name    string
	Command []string
}

func pupitreServer() Server {
	return Server{Name: MCPName, Command: []string{sudo.Binary, MCPSubcommand}}
}

func ClaudeMCP(cli string) *MCP {
	return &MCP{
		CLI:        cli,
		Config:     ".claude.json",
		Settings:   ".claude/settings.json",
		registered: claudeRegistered,
		add: func(server Server) []string {
			return append([]string{"mcp", "add", "--scope", "user", server.Name, "--"}, server.Command...)
		},
		remove: func(name string) []string { return []string{"mcp", "remove", "--scope", "user", name} },
	}
}

func CodexMCP(cli string) *MCP {
	return &MCP{
		CLI:        cli,
		Config:     ".codex/config.toml",
		registered: codexRegistered,
		add: func(server Server) []string {
			return append([]string{"mcp", "add", server.Name, "--"}, server.Command...)
		},
		remove: func(name string) []string { return []string{"mcp", "remove", name} },
	}
}

func hasServer(ctx *modules.Context, client *MCP, server Server) bool {
	raw, err := ctx.Sys().ReadFileIn(Home, client.Config)

	return err == nil && client.registered(raw, server)
}

func hasName(ctx *modules.Context, client *MCP, name string) bool {
	raw, err := ctx.Sys().ReadFileIn(Home, client.Config)

	return err == nil && namedIn(raw, name)
}

func registerMCP(ctx *modules.Context, target Target) error {
	if target.MCP == nil {
		return nil
	}

	return register(ctx, target.MCP, "register-mcp", pupitreServer())
}

// An entry under our name that runs something else is replaced: the name is Pupitre's.
func register(ctx *modules.Context, client *MCP, step string, server Server) error {
	return ctx.Step(step, func() (modules.Outcome, error) {
		if hasServer(ctx, client, server) {
			return modules.Skipped, nil
		}

		_, _ = user.Run(ctx, User, append([]string{client.CLI}, client.remove(server.Name)...)...)

		if _, err := user.Run(ctx, User, append([]string{client.CLI}, client.add(server)...)...); err != nil {
			return modules.Failed, err
		}

		if !hasServer(ctx, client, server) {
			return modules.Failed, errors.New(i18n.T("module.ai.mcp.unregistered", client.Config))
		}

		return modules.Done, nil
	})
}

func unregister(ctx *modules.Context, client *MCP, step, name string) error {
	return ctx.Step(step, func() (modules.Outcome, error) {
		if !hasName(ctx, client, name) {
			return modules.Skipped, nil
		}

		if _, err := user.Run(ctx, User, append([]string{client.CLI}, client.remove(name)...)...); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	})
}

func Unregister(ctx *modules.Context, target Target) error {
	if target.MCP == nil {
		return nil
	}

	if err := disallowTools(ctx, target, "disallow-mcp-tools", AllowRule); err != nil {
		return err
	}

	if err := unregister(ctx, target.MCP, "unregister-mcp", MCPName); err != nil {
		return err
	}

	return forgetBrowser(ctx, target)
}

func claudeServers(config []byte) map[string]struct {
	Command string   `json:"command"`
	Args    []string `json:"args"`
} {
	var document struct {
		MCPServers map[string]struct {
			Command string   `json:"command"`
			Args    []string `json:"args"`
		} `json:"mcpServers"`
	}

	if json.Unmarshal(config, &document) != nil {
		return nil
	}

	return document.MCPServers
}

func claudeRegistered(config []byte, server Server) bool {
	found, present := claudeServers(config)[server.Name]

	return present && found.Command == server.Command[0] && slices.Equal(found.Args, server.Command[1:])
}

// Claude's file is JSON and Codex's TOML: a name is declared when either reader finds its entry.
func namedIn(config []byte, name string) bool {
	if _, present := claudeServers(config)[name]; present {
		return true
	}

	_, _, declared := codexServer(config, name)

	return declared
}

func codexRegistered(config []byte, server Server) bool {
	command, args, declared := codexServer(config, server.Name)
	if !declared {
		return false
	}

	quoted := make([]string, 0, len(server.Command)-1)
	for _, arg := range server.Command[1:] {
		quoted = append(quoted, strconv.Quote(arg))
	}

	return command == strconv.Quote(server.Command[0]) && args == "["+strings.Join(quoted, ",")+"]"
}

// Only our table is read, line by line: a TOML parser for two keys would be the first dependency of the binary.
func codexServer(config []byte, name string) (string, string, bool) {
	command, args := "", ""
	inside, declared := false, false

	for _, line := range strings.Split(string(config), "\n") {
		trimmed := strings.TrimSpace(line)

		if strings.HasPrefix(trimmed, "[") {
			inside = trimmed == "[mcp_servers."+name+"]"
			declared = declared || inside

			continue
		}

		key, value, found := strings.Cut(trimmed, "=")
		if !inside || !found {
			continue
		}

		switch strings.TrimSpace(key) {
		case "command":
			command = strings.TrimSpace(value)
		case "args":
			args = strings.ReplaceAll(strings.TrimSpace(value), " ", "")
		}
	}

	return command, args, declared
}
