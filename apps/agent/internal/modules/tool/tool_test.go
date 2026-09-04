package tool_test

import (
	"reflect"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/tool"
	"pupitre.studio/agent/internal/modules/tool/github"
	"pupitre.studio/agent/internal/modules/tool/onepassword"
)

func registry(t *testing.T) *modules.Registry {
	t.Helper()

	registry := modules.NewRegistry()
	registry.Register(modtest.Passing{ID: "core.system"})
	registry.Register(github.Module{})
	registry.Register(onepassword.Module{})

	return registry
}

func TestTranscripts(t *testing.T) {
	modtest.RunTranscripts(t, "testdata/*.jsonl", modtest.TranscriptOptions{Registry: registry(t), Register: tool.RegisterCommands})
}

func TestTheTwoManifestsMatchTheCatalog(t *testing.T) {
	fields := map[string][]string{
		github.ID:      {"token"},
		onepassword.ID: {"service_account_token"},
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

		if manifest.Category != "tool" {
			t.Errorf("%s belongs to the tool category, got %q", manifest.ID, manifest.Category)
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
