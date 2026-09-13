package catalog_test

import (
	"slices"
	"testing"

	"pupitre.studio/agent/internal/modules"
)

/*
What this file proves: the catalogue says which of its modules hold something to
watch. A database, a tunnel, an editor server and a coding agent keep a process,
or spawn one at any moment; a language, a CLI and a hardening pass leave nothing
behind them, and the dashboard has no row to give them.

The list is written out rather than derived: a unit is not the rule — the
hardening pass runs a jail and still has nothing to show — so a new module has
to answer the question rather than inherit an answer.
*/

var running = []string{
	"ai.browser",
	"ai.claude",
	"ai.codex",
	"ai.cursor",
	"ai.hermes",
	"ai.opencode",
	"db.mongodb",
	"db.mysql",
	"db.postgres",
	"db.redis",
	"editor.jetbrains",
	"editor.vscode",
	"editor.zed",
	"exposure.caddy",
	"exposure.cloudflare",
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
