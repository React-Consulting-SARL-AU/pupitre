package exposure_test

import (
	"reflect"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure"
	"pupitre.studio/agent/internal/modules/exposure/cloudflare"
	"pupitre.studio/agent/internal/modules/exposure/ssh"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/state"
)

func registry(t *testing.T) *modules.Registry {
	t.Helper()

	registry := modules.NewRegistry()
	registry.Register(modtest.Passing{ID: "core.system"})
	registry.Register(cloudflare.Module{})
	registry.Register(ssh.Module{})

	return registry
}

// project.url comes from the state, and the tunnel is what decides between a subdomain and a local address: the two answer in the same transcript.
func TestTranscripts(t *testing.T) {
	modtest.RunTranscripts(t, "testdata/*.jsonl", modtest.TranscriptOptions{
		Registry: registry(t),
		Register: func(server *protocol.Server, engine *modules.Engine) {
			exposure.RegisterCommands(server, engine)
			state.RegisterCommands(server, state.FromEngine(engine, state.Options{
				Follow: state.FollowOptions{Limit: -1, Sleep: func(time.Duration) {}},
				Self:   func() int { return 900 },
				Sleep:  func(time.Duration) {},
			}))
		},
	})
}

func TestTheTwoManifestsMatchTheCatalog(t *testing.T) {
	fields := map[string][]string{
		cloudflare.ID: {"api_token", "account_id", "zone_id", "zone_name", "domain"},
		ssh.ID:        {},
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

		if manifest.Category != "exposure" {
			t.Errorf("%s belongs to the exposure category, got %q", manifest.ID, manifest.Category)
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

// One exposure at a time: the engine refuses the second one, and each manifest names the other.
func TestTheTwoExposuresConflict(t *testing.T) {
	for id, other := range map[string]string{cloudflare.ID: ssh.ID, ssh.ID: cloudflare.ID} {
		module, _ := registry(t).Get(id)

		if conflicts := module.Manifest().Conflicts; len(conflicts) != 1 || conflicts[0] != other {
			t.Errorf("%s must conflict with %s, got %v", id, other, conflicts)
		}
	}
}
