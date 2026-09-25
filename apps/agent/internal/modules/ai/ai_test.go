package ai_test

import (
	"reflect"
	"testing"

	"pupitre.studio/agent/internal/contract"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/ai/browser"
	"pupitre.studio/agent/internal/modules/ai/claude"
	"pupitre.studio/agent/internal/modules/ai/codex"
	"pupitre.studio/agent/internal/modules/ai/hermes"
	"pupitre.studio/agent/internal/modules/modtest"
)

func registry(t *testing.T) *modules.Registry {
	t.Helper()

	registry := modules.NewRegistry()
	registry.Register(modtest.Passing{ID: "core.system"})
	registry.Register(modtest.Passing{ID: "runtime.node"})
	registry.Register(modtest.Passing{ID: "runtime.python"})
	registry.Register(claude.Module{})
	registry.Register(codex.Module{})
	registry.Register(hermes.Module{})
	registry.Register(browser.Module{})

	return registry
}

func TestTranscripts(t *testing.T) {
	modtest.RunTranscripts(t, "testdata/*.jsonl", modtest.TranscriptOptions{Registry: registry(t)})
}

func TestTheFourManifestsMatchTheCatalog(t *testing.T) {
	fields := map[string][]string{
		claude.ID:  {},
		codex.ID:   {},
		hermes.ID:  {"providers", "always_on"},
		browser.ID: {},
	}

	for _, module := range registry(t).All() {
		manifest := module.Manifest()

		wanted, listed := fields[manifest.ID]
		if !listed {
			continue
		}

		if err := contract.ValidateValue("Manifest", manifest); err != nil {
			t.Errorf("%s: %v", manifest.ID, err)
		}

		if manifest.Category != "ai" {
			t.Errorf("%s belongs to the ai category, got %q", manifest.ID, manifest.Category)
		}

		keys := make([]string, 0, len(manifest.Fields))

		for _, field := range manifest.Fields {
			keys = append(keys, field.Key)
		}

		if !reflect.DeepEqual(keys, wanted) && !(len(keys) == 0 && len(wanted) == 0) {
			t.Errorf("%s fields = %v, want %v", manifest.ID, keys, wanted)
		}
	}
}
