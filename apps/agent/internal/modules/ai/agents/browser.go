package agents

import (
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	// Where ai.browser unpacks Chrome for Testing's headless shell on arm64, which Google's apt repository does not serve.
	HeadlessDir = "/opt/chrome-headless-shell"

	PlaywrightName    = "playwright"
	PlaywrightVersion = "0.0.83"
	// A screenshot taken without a name lands here, never in the project's repository.
	PlaywrightOutput = Home + "/.cache/playwright-mcp"

	BrowserAllowRule = "mcp__" + PlaywrightName
)

// Ubuntu's chromium-browser is left out: it is a snap stub, not a browser.
var Browsers = []string{
	"/usr/bin/google-chrome-stable",
	"/opt/google/chrome/google-chrome",
	HeadlessDir + "/chrome-headless-shell-linux-arm64/chrome-headless-shell",
	"/usr/bin/chromium",
}

var Playwright = mise.CLI{Tool: "npm:@playwright/mcp", Program: "playwright-mcp"}

var declared []Target

// The clients that take MCP servers declare themselves, so ai.browser reaches every one installed.
func Declare(target Target) Target {
	declared = append(declared, target)

	return target
}

func Browser(ctx sys.Context) string {
	for _, candidate := range Browsers {
		if file.Exists(ctx, candidate) {
			return candidate
		}
	}

	return ""
}

func playwrightServer(browser string) Server {
	return Server{Name: PlaywrightName, Command: []string{
		Playwright.Path(), "--headless", "--isolated", "--no-sandbox",
		"--executable-path", browser, "--output-dir", PlaywrightOutput,
	}}
}

// The registration exists exactly when a browser does.
func LayBrowser(ctx *modules.Context, target Target) error {
	if target.MCP == nil {
		return nil
	}

	browser := Browser(ctx)
	if browser == "" {
		return forgetBrowser(ctx, target)
	}

	if _, err := mise.Add(ctx, "install-browser-mcp", Playwright.Tool, PlaywrightVersion); err != nil {
		return err
	}

	if err := register(ctx, target.MCP, "register-browser-mcp", playwrightServer(browser)); err != nil {
		return err
	}

	return allowTools(ctx, target, "allow-browser-tools", BrowserAllowRule)
}

func forgetBrowser(ctx *modules.Context, target Target) error {
	if target.MCP == nil {
		return nil
	}

	if err := disallowTools(ctx, target, "disallow-browser-tools", BrowserAllowRule); err != nil {
		return err
	}

	return unregister(ctx, target.MCP, "unregister-browser-mcp", PlaywrightName)
}

func BrowserLaid(ctx *modules.Context, target Target) bool {
	if target.MCP == nil {
		return true
	}

	browser := Browser(ctx)
	if browser == "" {
		return !hasName(ctx, target.MCP, PlaywrightName)
	}

	return mise.Matches(mise.Installed(ctx)[Playwright.Tool], PlaywrightVersion) &&
		hasServer(ctx, target.MCP, playwrightServer(browser)) &&
		toolsAllowed(ctx, target, BrowserAllowRule)
}

func LayBrowserEverywhere(ctx *modules.Context) error {
	for _, target := range installedClients(ctx) {
		if err := LayBrowser(ctx, target); err != nil {
			return err
		}
	}

	return nil
}

func BrowserLaidEverywhere(ctx *modules.Context) bool {
	for _, target := range installedClients(ctx) {
		if !BrowserLaid(ctx, target) {
			return false
		}
	}

	return true
}

// A machine without mise never held it: no AI client was there to lay it.
func RemoveBrowserServer(ctx *modules.Context) error {
	if !mise.Present(ctx) {
		return nil
	}

	return mise.Remove(ctx, "remove-browser-mcp", Playwright.Tool)
}

func installedClients(ctx *modules.Context) []Target {
	var clients []Target

	for _, target := range declared {
		if target.MCP != nil && file.Exists(ctx, target.MCP.CLI) {
			clients = append(clients, target)
		}
	}

	return clients
}
