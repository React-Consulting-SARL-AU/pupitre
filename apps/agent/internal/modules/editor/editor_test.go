package editor_test

import (
	"reflect"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/editor/jetbrains"
	"pupitre.studio/agent/internal/modules/editor/vscode"
	"pupitre.studio/agent/internal/modules/editor/zed"
	"pupitre.studio/agent/internal/modules/modtest"
)

func registry(t *testing.T) *modules.Registry {
	t.Helper()

	registry := modules.NewRegistry()
	registry.Register(modtest.Passing{ID: "core.system"})
	registry.Register(jetbrains.Module{})
	registry.Register(vscode.Module{})
	registry.Register(zed.Module{})

	return registry
}

func TestTranscripts(t *testing.T) {
	modtest.RunTranscripts(t, "testdata/*.jsonl", modtest.TranscriptOptions{Registry: registry(t)})
}

func TestTheThreeManifestsMatchTheCatalog(t *testing.T) {
	fields := map[string][]string{
		jetbrains.ID: {"ide", "version"},
		vscode.ID:    {"extensions", "tunnel"},
		zed.ID:       {"version"},
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

		if manifest.Category != "editor" {
			t.Errorf("%s belongs to the editor category, got %q", manifest.ID, manifest.Category)
		}

		keys := make([]string, 0, len(manifest.Fields))
		for _, field := range manifest.Fields {
			keys = append(keys, field.Key)
		}

		if !reflect.DeepEqual(keys, wanted) {
			t.Errorf("%s fields = %v, want %v", manifest.ID, keys, wanted)
		}
	}
}
