package agents

import (
	"encoding/json"
	"errors"
	"slices"
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
	Config     string
	Registered func(config []byte) bool
	Add        []string
	Remove     []string
	// The settings whose permissions.allow lets the tools run without a prompt; empty for a client without that list.
	Settings string
}

func ClaudeMCP(cli string) *MCP {
	return &MCP{
		CLI:        cli,
		Config:     ".claude.json",
		Settings:   ".claude/settings.json",
		Registered: claudeRegistered,
		Add:        []string{"mcp", "add", "--scope", "user", MCPName, "--", sudo.Binary, MCPSubcommand},
		Remove:     []string{"mcp", "remove", "--scope", "user", MCPName},
	}
}

func CodexMCP(cli string) *MCP {
	return &MCP{
		CLI:        cli,
		Config:     ".codex/config.toml",
		Registered: codexRegistered,
		Add:        []string{"mcp", "add", MCPName, "--", sudo.Binary, MCPSubcommand},
		Remove:     []string{"mcp", "remove", MCPName},
	}
}

func mcpRegistered(ctx *modules.Context, server *MCP) bool {
	raw, err := ctx.Sys().ReadFileIn(Home, server.Config)

	return err == nil && server.Registered(raw)
}

// An entry under our name that runs something else is replaced: the name is Pupitre's.
func registerMCP(ctx *modules.Context, target Target) error {
	if target.MCP == nil {
		return nil
	}

	server := target.MCP

	return ctx.Step("register-mcp", func() (modules.Outcome, error) {
		if mcpRegistered(ctx, server) {
			return modules.Skipped, nil
		}

		_, _ = user.Run(ctx, User, append([]string{server.CLI}, server.Remove...)...)

		if _, err := user.Run(ctx, User, append([]string{server.CLI}, server.Add...)...); err != nil {
			return modules.Failed, err
		}

		if !mcpRegistered(ctx, server) {
			return modules.Failed, errors.New(i18n.T("module.ai.mcp.unregistered", server.Config))
		}

		return modules.Done, nil
	})
}

func Unregister(ctx *modules.Context, target Target) error {
	if target.MCP == nil {
		return nil
	}

	if err := disallowTools(ctx, target); err != nil {
		return err
	}

	server := target.MCP

	return ctx.Step("unregister-mcp", func() (modules.Outcome, error) {
		if !mcpRegistered(ctx, server) {
			return modules.Skipped, nil
		}

		if _, err := user.Run(ctx, User, append([]string{server.CLI}, server.Remove...)...); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	})
}

func claudeRegistered(config []byte) bool {
	var document struct {
		MCPServers map[string]struct {
			Command string   `json:"command"`
			Args    []string `json:"args"`
		} `json:"mcpServers"`
	}

	if json.Unmarshal(config, &document) != nil {
		return false
	}

	server, found := document.MCPServers[MCPName]

	return found && server.Command == sudo.Binary && slices.Equal(server.Args, []string{MCPSubcommand})
}

// Only our table is read, line by line: a TOML parser for two keys would be the first dependency of the binary.
func codexRegistered(config []byte) bool {
	command, args := "", ""
	inside := false

	for _, line := range strings.Split(string(config), "\n") {
		trimmed := strings.TrimSpace(line)

		if strings.HasPrefix(trimmed, "[") {
			inside = trimmed == "[mcp_servers."+MCPName+"]"

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

	return command == `"`+sudo.Binary+`"` && args == `["`+MCPSubcommand+`"]`
}
