package contract

// Copy of PRESETS in packages/shared/src/catalog/index.ts; presets_test.go checks it against schema.json.
var Presets = []Preset{
	{
		ID: "web-js",
		Modules: []string{
			"core.system", "core.hardening", "runtime.node", "db.mysql",
			"ai.claude", "ai.browser", "editor.vscode", "exposure.ssh",
		},
	},
	{
		ID: "full",
		Modules: []string{
			"core.system", "core.hardening",
			"runtime.node", "runtime.java", "runtime.python",
			"db.mysql", "db.postgres", "db.mongodb",
			"ai.claude", "ai.codex", "ai.hermes", "ai.browser",
			"editor.jetbrains", "editor.vscode", "editor.zed",
			"exposure.cloudflare", "exposure.ssh",
			"tool.github", "tool.1password",
		},
	},
	{
		ID:        "minimal",
		Modules:   []string{"core.system", "core.hardening"},
		ChooseOne: []string{"ai.claude", "ai.codex", "ai.hermes"},
	},
}

var MandatoryModules = []string{"core.system", "core.hardening"}
