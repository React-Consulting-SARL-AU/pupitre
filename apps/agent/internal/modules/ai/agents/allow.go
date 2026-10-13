package agents

import (
	"encoding/json"
	"errors"
	"io/fs"
	"slices"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
)

// Every tool of the server: they only reach the limited session, which already refuses what needs the owner.
const AllowRule = "mcp__" + MCPName

// The settings are the client's: only our rule is added or taken out, every other key is written back as read.
func allowTools(ctx *modules.Context, target Target) error {
	if target.MCP == nil || target.MCP.Settings == "" {
		return nil
	}

	settings := target.MCP.Settings

	return ctx.Step("allow-mcp-tools", func() (modules.Outcome, error) {
		document, err := readSettings(ctx, settings)
		if err != nil {
			return modules.Failed, err
		}

		allowed := allowList(document)
		if slices.Contains(allowed, any(AllowRule)) {
			return modules.Skipped, nil
		}

		return modules.Done, writeAllowList(ctx, settings, document, append(allowed, AllowRule))
	})
}

func disallowTools(ctx *modules.Context, target Target) error {
	if target.MCP == nil || target.MCP.Settings == "" {
		return nil
	}

	settings := target.MCP.Settings

	return ctx.Step("disallow-mcp-tools", func() (modules.Outcome, error) {
		document, err := readSettings(ctx, settings)
		if err != nil {
			return modules.Failed, err
		}

		allowed := allowList(document)
		if !slices.Contains(allowed, any(AllowRule)) {
			return modules.Skipped, nil
		}

		kept := slices.DeleteFunc(allowed, func(rule any) bool { return rule == AllowRule })

		return modules.Done, writeAllowList(ctx, settings, document, kept)
	})
}

func toolsAllowed(ctx *modules.Context, target Target) bool {
	if target.MCP == nil || target.MCP.Settings == "" {
		return true
	}

	document, err := readSettings(ctx, target.MCP.Settings)

	return err == nil && slices.Contains(allowList(document), any(AllowRule))
}

// A file that does not parse is refused rather than replaced: it holds the client's own permissions.
func readSettings(ctx *modules.Context, settings string) (map[string]any, error) {
	raw, err := ctx.Sys().ReadFileIn(Home, settings)
	if errors.Is(err, fs.ErrNotExist) {
		return map[string]any{}, nil
	}

	if err != nil {
		return nil, err
	}

	document := map[string]any{}
	if err := json.Unmarshal(raw, &document); err != nil {
		return nil, errors.New(i18n.T("module.ai.settings.unreadable", "~/"+settings, err.Error()))
	}

	return document, nil
}

func allowList(document map[string]any) []any {
	permissions, _ := document["permissions"].(map[string]any)
	rules, _ := permissions["allow"].([]any)

	return rules
}

func writeAllowList(ctx *modules.Context, settings string, document map[string]any, allowed []any) error {
	permissions, _ := document["permissions"].(map[string]any)
	if permissions == nil {
		permissions = map[string]any{}
	}

	permissions["allow"] = allowed
	document["permissions"] = permissions

	raw, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return err
	}

	return ctx.Sys().WriteFileIn(Home, settings, User, append(raw, '\n'))
}
