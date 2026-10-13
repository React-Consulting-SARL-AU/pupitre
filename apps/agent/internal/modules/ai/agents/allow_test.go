package agents

import (
	"encoding/json"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
)

const settingsPath = Home + "/.claude/settings.json"

func allowed(t *testing.T, fake *modtest.FakeSys) map[string]any {
	t.Helper()

	document := map[string]any{}
	if err := json.Unmarshal(fake.Files[settingsPath], &document); err != nil {
		t.Fatalf("settings.json: %v\n%s", err, fake.Files[settingsPath])
	}

	return document
}

func TestThePupitreToolsAreAllowedBesideTheClientsOwnRules(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[settingsPath] = []byte(`{"model":"opus","permissions":{"allow":["Bash(npm test)"],"deny":["Read(.env)"]},"hooks":{"Stop":[]}}`)
	ctx := newContext(t, fake)

	if err := Deploy(ctx, withClaude()); err != nil {
		t.Fatal(err)
	}

	document := allowed(t, fake)
	permissions := document["permissions"].(map[string]any)

	if rules, _ := json.Marshal(permissions["allow"]); string(rules) != `["Bash(npm test)","mcp__pupitre"]` {
		t.Fatalf("allow = %s, want the client's rule then ours", rules)
	}

	if document["model"] != "opus" || document["hooks"] == nil || permissions["deny"] == nil {
		t.Fatalf("every other key is the client's and stays: %s", fake.Files[settingsPath])
	}

	if fake.Owners[settingsPath] != "" && fake.Owners[settingsPath] != User+":"+User {
		t.Fatalf("the settings stay dev's, got %q", fake.Owners[settingsPath])
	}

	if !Configured(ctx, withClaude()) {
		t.Fatal("allowed tools read as configured")
	}

	fake.Mutations = nil
	if err := Deploy(newContext(t, fake), withClaude()); err != nil || len(fake.Mutations) != 0 {
		t.Fatalf("a replay writes nothing: %v\n  %s", err, strings.Join(fake.Mutations, "\n  "))
	}
}

func TestWithoutSettingsTheRuleIsTheFilesFirstLine(t *testing.T) {
	fake := modtest.NewFakeSys()

	if err := Deploy(newContext(t, fake), withClaude()); err != nil {
		t.Fatal(err)
	}

	if rules, _ := json.Marshal(allowed(t, fake)["permissions"]); string(rules) != `{"allow":["mcp__pupitre"]}` {
		t.Fatalf("permissions = %s", rules)
	}
}

func TestSettingsThatDoNotParseAreLeftAlone(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[settingsPath] = []byte(`{"permissions": {`)

	err := Deploy(newContext(t, fake), withClaude())
	if err == nil || !strings.Contains(err.Error(), "settings.json") {
		t.Fatalf("the step must refuse: %v", err)
	}

	if string(fake.Files[settingsPath]) != `{"permissions": {` {
		t.Fatal("a file the agent cannot read is not rewritten")
	}
}

func TestUnregisteringTakesOurRuleOutOnly(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[settingsPath] = []byte(`{"permissions":{"allow":["Bash(ls)"]}}`)

	if err := Deploy(newContext(t, fake), withClaude()); err != nil {
		t.Fatal(err)
	}

	if err := Unregister(newContext(t, fake), withClaude()); err != nil {
		t.Fatal(err)
	}

	if rules, _ := json.Marshal(allowed(t, fake)["permissions"]); string(rules) != `{"allow":["Bash(ls)"]}` {
		t.Fatalf("permissions = %s", rules)
	}
}

func TestCodexHasNoAllowListToWrite(t *testing.T) {
	fake := modtest.NewFakeSys()
	codex := demo
	codex.MCP = CodexMCP(Home + "/.local/share/mise/shims/codex")

	if err := Deploy(newContext(t, fake), codex); err != nil {
		t.Fatal(err)
	}

	if _, written := fake.Files[settingsPath]; written {
		t.Fatal("only Claude Code reads that list")
	}
}
