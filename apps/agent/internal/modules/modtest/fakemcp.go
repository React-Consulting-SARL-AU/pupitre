package modtest

import (
	"encoding/json"
	"slices"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/sys"
)

// claude and codex keep their MCP servers in their own file, which `<cli> mcp add|remove` rewrites like the real ones.
func (f *FakeSys) mcp(cmd sys.Command) (sys.Output, error) {
	program := base(cmd.Argv[0])
	verb := cmd.Argv[2]

	words := slices.DeleteFunc(slices.Clone(cmd.Argv[3:]), func(word string) bool { return word == "--scope" || word == "user" })
	separator := slices.Index(words, "--")

	if len(words) == 0 || (verb == "add" && (separator != 1 || len(words) < 3)) {
		return f.fail(program, "usage: "+program+" mcp add <name> -- <command> [args...]")
	}

	home := f.Users[cmd.User]
	if home == "" {
		home = "/home/" + cmd.User
	}

	name := words[0]

	switch {
	case program == "claude" && verb == "add":
		return sys.Output{}, f.claudeServers(home, func(servers map[string]any) { servers[name] = stdio(words[separator+1:]) })
	case program == "claude" && verb == "remove":
		return f.claudeRemove(home, name)
	case program == "codex" && verb == "add":
		return sys.Output{}, f.codexServers(home, name, words[separator+1:])
	case program == "codex" && verb == "remove":
		return sys.Output{}, f.codexServers(home, name, nil)
	}

	return f.fail(program, "unknown mcp verb "+verb)
}

func stdio(command []string) map[string]any {
	return map[string]any{"type": "stdio", "command": command[0], "args": command[1:], "env": map[string]any{}}
}

func (f *FakeSys) claudeServers(home string, change func(map[string]any)) error {
	document := map[string]any{}
	_ = json.Unmarshal(f.Files[home+"/.claude.json"], &document)

	servers, _ := document["mcpServers"].(map[string]any)
	if servers == nil {
		servers = map[string]any{}
	}

	change(servers)
	document["mcpServers"] = servers

	raw, err := json.Marshal(document)
	if err != nil {
		return err
	}

	return f.WriteFile(home+"/.claude.json", raw, 0o600)
}

func (f *FakeSys) claudeRemove(home, name string) (sys.Output, error) {
	document := map[string]any{}
	_ = json.Unmarshal(f.Files[home+"/.claude.json"], &document)

	if servers, _ := document["mcpServers"].(map[string]any); servers[name] == nil {
		return f.fail("claude", "No MCP server found with name: "+name)
	}

	return sys.Output{}, f.claudeServers(home, func(servers map[string]any) { delete(servers, name) })
}

// Drops the named table, then appends it again when a command is given.
func (f *FakeSys) codexServers(home, name string, command []string) error {
	path := home + "/.codex/config.toml"
	header := "[mcp_servers." + name + "]"

	var kept []string

	inside := false

	for _, line := range strings.Split(strings.TrimRight(string(f.Files[path]), "\n"), "\n") {
		if strings.HasPrefix(line, "[") {
			inside = line == header
		}

		if !inside && line != "" {
			kept = append(kept, line)
		}
	}

	if len(command) > 0 {
		quoted := make([]string, 0, len(command)-1)
		for _, arg := range command[1:] {
			quoted = append(quoted, strconv.Quote(arg))
		}

		kept = append(kept, header, "command = "+strconv.Quote(command[0]), "args = ["+strings.Join(quoted, ", ")+"]")
	}

	return f.WriteFile(path, []byte(strings.Join(kept, "\n")+"\n"), 0o600)
}
