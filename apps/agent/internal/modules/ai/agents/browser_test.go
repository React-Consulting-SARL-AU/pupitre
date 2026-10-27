package agents

import (
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/mise"
)

const chrome = "/opt/google/chrome/google-chrome"

func withBrowser(fake *modtest.FakeSys) {
	fake.Files[chrome] = []byte("chrome")
	fake.Files[mise.Path] = []byte("mise\n")
}

func playwrightCommand() []string {
	return []string{Playwright.Path(), "--headless", "--isolated", "--no-sandbox", "--executable-path", chrome, "--output-dir", PlaywrightOutput}
}

func TestClaudeIsGivenTheServersBrowserThroughPlaywright(t *testing.T) {
	fake := modtest.NewFakeSys()
	withBrowser(fake)

	if err := Deploy(newContext(t, fake), withClaude()); err != nil {
		t.Fatal(err)
	}

	if fake.Tools[Playwright.Tool] != PlaywrightVersion {
		t.Fatalf("Playwright MCP must be installed at its pinned version: %v", fake.Tools)
	}

	server := claudeServers(fake.Files[Home+"/.claude.json"])[PlaywrightName]
	if server.Command != Playwright.Path() || !slices.Equal(server.Args, playwrightCommand()[1:]) {
		t.Fatalf("playwright must run the shim on the installed Chrome, headless and isolated: %+v", server)
	}

	if !strings.Contains(string(fake.Files[Home+"/.claude/settings.json"]), `"`+BrowserAllowRule+`"`) {
		t.Fatalf("the browser's tools must run without a prompt: %s", fake.Files[Home+"/.claude/settings.json"])
	}

	if !Configured(newContext(t, fake), withClaude()) {
		t.Fatal("a client holding both servers reads as configured")
	}

	fake.Calls = nil

	if err := Deploy(newContext(t, fake), withClaude()); err != nil || len(mcpCalls(fake)) != 0 {
		t.Fatalf("a laid browser is not laid again: %v", fake.Commands())
	}
}

func TestABrowserWithoutItsServerReadsBehind(t *testing.T) {
	fake := modtest.NewFakeSys()

	if err := Deploy(newContext(t, fake), withClaude()); err != nil {
		t.Fatal(err)
	}

	if _, laid := claudeServers(fake.Files[Home+"/.claude.json"])[PlaywrightName]; laid {
		t.Fatal("no browser, no playwright")
	}

	withBrowser(fake)

	if Configured(newContext(t, fake), withClaude()) {
		t.Fatal("a browser installed after the client must make it read as behind")
	}
}

func TestTheServerLeavesWithTheBrowser(t *testing.T) {
	fake := modtest.NewFakeSys()
	withBrowser(fake)

	if err := Deploy(newContext(t, fake), withClaude()); err != nil {
		t.Fatal(err)
	}

	delete(fake.Files, chrome)

	if Configured(newContext(t, fake), withClaude()) {
		t.Fatal("a server left without its browser reads as behind")
	}

	if err := Deploy(newContext(t, fake), withClaude()); err != nil {
		t.Fatal(err)
	}

	if _, laid := claudeServers(fake.Files[Home+"/.claude.json"])[PlaywrightName]; laid {
		t.Fatalf("playwright must go with the browser: %s", fake.Files[Home+"/.claude.json"])
	}

	if strings.Contains(string(fake.Files[Home+"/.claude/settings.json"]), BrowserAllowRule) {
		t.Fatal("its rule goes too")
	}

	if _, kept := claudeServers(fake.Files[Home+"/.claude.json"])[MCPName]; !kept || !Configured(newContext(t, fake), withClaude()) {
		t.Fatal("the pupitre server stays")
	}
}

func TestCodexTakesThePlaywrightTable(t *testing.T) {
	fake := modtest.NewFakeSys()
	withBrowser(fake)

	target := demo
	target.MCP = CodexMCP(Home + "/.local/share/mise/shims/codex")

	if err := Deploy(newContext(t, fake), target); err != nil {
		t.Fatal(err)
	}

	config := fake.Files[Home+"/.codex/config.toml"]
	if !codexRegistered(config, playwrightServer(chrome)) || !codexRegistered(config, pupitreServer()) {
		t.Fatalf("both tables must be declared: %s", config)
	}
}

func TestOnlyTheClientsOnTheMachineAreReached(t *testing.T) {
	fake := modtest.NewFakeSys()
	withBrowser(fake)
	fake.Files[claudeCLI] = []byte("claude")

	codex := demo
	codex.MCP = CodexMCP(Home + "/.local/share/mise/shims/codex")

	before := declared
	declared = []Target{withClaude(), codex}
	t.Cleanup(func() { declared = before })

	ctx := newContext(t, fake)

	if BrowserLaidEverywhere(ctx) {
		t.Fatal("Claude is on the machine without playwright")
	}

	if err := LayBrowserEverywhere(ctx); err != nil {
		t.Fatal(err)
	}

	if _, laid := claudeServers(fake.Files[Home+"/.claude.json"])[PlaywrightName]; !laid || !BrowserLaidEverywhere(newContext(t, fake)) {
		t.Fatalf("Claude must hold playwright: %s", fake.Files[Home+"/.claude.json"])
	}

	if _, touched := fake.Files[Home+"/.codex/config.toml"]; touched {
		t.Fatal("a client absent from the machine is left alone")
	}
}
