package catalog_test

import (
	"slices"
	"testing"

	"pupitre.studio/agent/internal/modules"
)

// Written out, not derived from systemd units: hardening runs a jail yet shows nothing, so a new module must decide.
var running = []string{
	"ai.browser",
	"ai.claude",
	"ai.codex",
	"ai.copilot",
	"ai.cursor",
	"ai.gemini",
	"ai.hermes",
	"ai.openclaw",
	"ai.opencode",
	"db.mailpit",
	"db.mongodb",
	"db.mysql",
	"db.postgres",
	"db.redis",
	"editor.jetbrains",
	"editor.vscode",
	"editor.zed",
	"exposure.caddy",
	"exposure.cloudflare",
	"exposure.tailscale",
	"runtime.docker",
}

func TestTheCatalogueSaysWhichModulesRun(t *testing.T) {
	declared := []string{}

	for _, module := range modules.Default().All() {
		if manifest := module.Manifest(); manifest.Runs {
			declared = append(declared, manifest.ID)
		}
	}

	slices.Sort(declared)

	if !slices.Equal(declared, running) {
		t.Fatalf("the modules that run are %v, expected %v", declared, running)
	}
}
